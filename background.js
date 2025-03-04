// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadArticle') {
    downloadArticle(request.data);
  } else if (request.action === 'downloadMedia') {
    try {
      const { blob, filename, type } = request.data;
      // 将ArrayBuffer转换为Blob
      const mediaBlob = new Blob([blob], { type });
      // 创建Blob URL
      const url = URL.createObjectURL(mediaBlob);
      // 下载文件
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, () => {
        // 清理Blob URL
        URL.revokeObjectURL(url);
        sendResponse({ success: true });
      });
    } catch (error) {
      console.error('下载媒体文件失败:', error);
      sendResponse({ error: error.message });
    }
    return true; // 保持消息通道开放
  }
});

// 监听下载完成事件
chrome.downloads.onChanged.addListener(function(delta) {
  if (delta.state && delta.state.current === 'complete') {
    chrome.downloads.search({id: delta.id}, function(downloads) {
      if (downloads && downloads[0]) {
        const downloadItem = downloads[0];
        // 获取文件完整路径
        const filePath = downloadItem.filename;
        // 发送下载完成消息给popup，包含完整的文件路径信息
        chrome.runtime.sendMessage({
          action: 'downloadComplete',
          filePath: filePath,
          message: `文件已保存到：${filePath}`
        });
        // 创建系统通知
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '下载完成',
          message: `文件已保存到：${filePath}`,
          priority: 2
        });
      }
    });
  }
});

// 处理文章下载
async function downloadArticle(data) {
  try {
    const { title, content, hasMedia, dataId } = data;
    
    // 根据是否包含媒体文件决定下载方式
    if (hasMedia && dataId) {
      console.log('开始处理带媒体文件的下载，数据ID:', dataId);
      
      // 从IndexedDB获取数据
      const result = await new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (!tabs[0]?.id) {
            reject(new Error('无法获取当前标签页'));
            return;
          }
          
          // 设置超时处理
          const timeoutId = setTimeout(() => {
            reject(new Error('获取数据超时，请重试'));
          }, 30000); // 30秒超时
          
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'getArticleData',
            dataId: dataId
          }, response => {
            clearTimeout(timeoutId); // 清除超时定时器
            
            if (chrome.runtime.lastError) {
              reject(new Error('获取数据失败：' + chrome.runtime.lastError.message));
            } else if (!response || !response.success) {
              reject(new Error(response?.error || '获取数据失败'));
            } else {
              // 验证响应数据的完整性
              if (!response.data || typeof response.data !== 'object') {
                reject(new Error('响应数据格式无效'));
                return;
              }
              resolve(response);
            }
          });
        });
      });
      
      if (!result || !result.data) {
        throw new Error('无法获取文件数据');
      }

      // 验证数据类型并确保是Blob对象
      let blob = result.data;
      console.log('接收到的数据类型:', Object.prototype.toString.call(blob));
      console.log('数据大小:', blob instanceof Blob ? blob.size : '未知');

      // 如果数据是字符串（可能是序列化的数据），尝试解析
      if (typeof blob === 'string') {
        try {
          const parsed = JSON.parse(blob);
          if (parsed && typeof parsed === 'object') {
            // 如果解析成功且是对象，尝试从对象中提取数据
            blob = new Blob([parsed.data || parsed], { type: 'application/zip' });
          } else {
            // 如果不是对象，直接使用字符串创建Blob
            blob = new Blob([blob], { type: 'application/zip' });
          }
        } catch (e) {
          // 如果解析失败，直接使用字符串创建Blob
          blob = new Blob([blob], { type: 'application/zip' });
        }
      } else if (!(blob instanceof Blob)) {
        // 如果不是Blob，尝试转换
        if (blob instanceof ArrayBuffer) {
          blob = new Blob([blob], { type: 'application/zip' });
        } else if (Array.isArray(blob) || ArrayBuffer.isView(blob)) {
          blob = new Blob([new Uint8Array(blob)], { type: 'application/zip' });
        } else {
          // 其他情况，尝试将整个数据对象转换为Blob
          try {
            const arrayBuffer = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error);
              reader.readAsArrayBuffer(new Blob([JSON.stringify(blob)]));
            });
            blob = new Blob([arrayBuffer], { type: 'application/zip' });
          } catch (error) {
            console.error('数据转换失败:', error);
            throw new Error('无效的文件数据格式：' + error.message);
          }
        }
      }
      
      // 验证Blob大小
      if (!blob || blob.size < 100) {
        console.error('Blob大小异常:', blob?.size);
        throw new Error(`文件数据异常：大小为 ${blob?.size || 0} 字节`);
      }
      
      // 使用FileReader将Blob转换为base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const result = reader.result;
            if (!result || result.length < 100) {
              console.error('Base64数据异常:', {
                resultExists: !!result,
                length: result?.length || 0
              });
              reject(new Error(`Base64数据异常：长度为 ${result?.length || 0}`));
              return;
            }
            // 验证base64数据的格式
            if (!result.startsWith('data:') || !result.includes(';base64,')) {
              reject(new Error('Base64数据格式无效'));
              return;
            }
            resolve(result);
          } catch (error) {
            console.error('处理文件数据失败:', error);
            reject(new Error('处理文件数据失败：' + error.message));
          }
        };
        reader.onerror = () => {
          console.error('读取文件失败:', reader.error);
          reject(new Error('读取文件失败：' + reader.error));
        };
        reader.readAsDataURL(blob);
      });

      // 创建下载
      const downloadId = await chrome.downloads.download({
        url: base64Data,
        filename: `${title}.zip`,
        saveAs: true
      });
      console.log('开始下载zip文件，下载ID:', downloadId);
    } else {
      // 仅下载markdown文件
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(content);
      const base64Data = btoa(String.fromCharCode.apply(null, uint8Array));

      const downloadId = await chrome.downloads.download({
        url: `data:text/markdown;base64,${base64Data}`,
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

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'articleDataReady' && request.data) {
    console.log('收到文章数据，准备下载...');
    // 创建下载
    const blob = new Blob([request.data], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: blobUrl,
      filename: sender.tab ? `${sender.tab.title}.zip` : 'article.zip',
      saveAs: true
    }).then(downloadId => {
      console.log('下载已开始，ID:', downloadId);
      URL.revokeObjectURL(blobUrl); // 下载开始后释放Blob URL
    }).catch(error => {
      console.error('下载失败:', error);
      URL.revokeObjectURL(blobUrl); // 发生错误时也要释放Blob URL
      chrome.runtime.sendMessage({
        action: 'downloadError',
        error: error.message
      });
    });
  }
});
// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContentResult') {
    // 处理提取的内容
    handleExtractedContent(request.data);
  }
});

// 处理提取的内容
async function handleExtractedContent(data) {
  if (!data || !data.success) {
    console.error('内容提取失败:', data?.error || '未知错误');
    return;
  }

  try {
    // 创建下载文件夹
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `wechat_article_${timestamp}`;
    
    // 保存Markdown文件
    const markdownBlob = new Blob([data.content], { type: 'text/markdown' });
    const markdownUrl = URL.createObjectURL(markdownBlob);
    await chrome.downloads.download({
      url: markdownUrl,
      filename: `${folderName}/article.md`,
      saveAs: false
    });
    URL.revokeObjectURL(markdownUrl);

    // 保存媒体文件
    if (data.hasMedia && data.mediaFiles) {
      for (const file of data.mediaFiles) {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url: url,
          filename: `${folderName}/${file.filename}`,
          saveAs: false
        });
        URL.revokeObjectURL(url);
      }
    }

    console.log('文件保存完成');
  } catch (error) {
    console.error('保存文件时发生错误:', error);
  }
}
// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createDirectory') {
    // 创建目录
    chrome.downloads.download({
      url: 'data:,', // 一个空的数据URL
      filename: request.path + '/.placeholder',
      saveAs: false
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('创建目录失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开放
  }
});
// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadMedia') {
    try {
      chrome.downloads.download({
        url: request.data.url,
        filename: request.data.filename,
        saveAs: request.data.saveAs || false
      }).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('下载媒体文件失败:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // 保持消息通道开放
    } catch (error) {
      console.error('处理下载请求失败:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
});
// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContentResult') {
    // 处理提取的内容
    handleExtractedContent(request.data);
  }
});

// 处理提取的内容
async function handleExtractedContent(data) {
  if (!data || !data.success) {
    console.error('内容提取失败:', data?.error || '未知错误');
    return;
  }

  try {
    // 创建下载文件夹
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `wechat_article_${timestamp}`;
    
    // 保存Markdown文件
    const markdownBlob = new Blob([data.content], { type: 'text/markdown' });
    const markdownUrl = URL.createObjectURL(markdownBlob);
    await chrome.downloads.download({
      url: markdownUrl,
      filename: `${folderName}/article.md`,
      saveAs: false
    });
    URL.revokeObjectURL(markdownUrl);

    // 保存媒体文件
    if (data.hasMedia && data.mediaFiles) {
      for (const file of data.mediaFiles) {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url: url,
          filename: `${folderName}/${file.filename}`,
          saveAs: false
        });
        URL.revokeObjectURL(url);
      }
    }

    console.log('文件保存完成');
  } catch (error) {
    console.error('保存文件时发生错误:', error);
  }
}