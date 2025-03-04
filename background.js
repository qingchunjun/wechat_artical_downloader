// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadArticle') {
    downloadArticle(request.data);
  }
});

// 监听下载完成事件
chrome.downloads.onChanged.addListener(function(delta) {
  if (delta.state && delta.state.current === 'complete') {
    chrome.downloads.search({id: delta.id}, function(downloads) {
      if (downloads && downloads[0]) {
        const downloadItem = downloads[0];
        // 发送下载完成消息给popup
        chrome.runtime.sendMessage({
          action: 'downloadComplete',
          filePath: downloadItem.filename
        });
      }
    });
  }
});

// 处理文章下载
async function downloadArticle(data) {
  try {
    const { title, content, hasMedia, zipBlob } = data;
    
    // 根据是否包含媒体文件决定下载方式
    if (hasMedia) {
      if (!zipBlob || !zipBlob.data || !zipBlob.type) {
        throw new Error('无效的压缩文件数据');
      }
      // 重新构造Blob对象
      const arrayBuffer = new Uint8Array(zipBlob.data).buffer;
      const blob = new Blob([arrayBuffer], { type: zipBlob.type });
      // 下载zip压缩包
      const downloadId = await chrome.downloads.download({
        url: `data:application/zip;base64,${await blobToBase64(blob)}`,
        filename: `${title}.zip`,
        saveAs: true
      });
      console.log('开始下载zip文件，下载ID:', downloadId);
    } else {
      // 仅下载markdown文件
      const blob = new Blob([content], { type: 'text/markdown' });
      const downloadId = await chrome.downloads.download({
        url: `data:text/markdown;base64,${await blobToBase64(blob)}`,
        filename: `${title}.md`,
        saveAs: true
      });
      console.log('开始下载markdown文件，下载ID:', downloadId);
    }
  } catch (error) {
    console.error('下载文件时发生错误:', error);
    // 发送错误消息给popup
    chrome.runtime.sendMessage({
      action: 'downloadError',
      error: error.message
    });
  }
}

// 将Blob转换为Base64字符串
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!(blob instanceof Blob)) {
      reject(new Error('参数必须是Blob类型'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}