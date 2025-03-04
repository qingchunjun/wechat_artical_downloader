// 监听来自content script和background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractContentResult') {
    handleExtractContentResult(request);
  } else if (request.action === 'downloadComplete') {
    statusElement.textContent = `下载完成！文件已保存到: ${request.filePath}`;
  } else if (request.action === 'downloadError') {
    statusElement.textContent = '下载失败：' + request.error;
  }
});

let currentTabId = null;
let statusElement = null;

// 处理content script返回的结果
async function handleExtractContentResult(request) {
  if (!statusElement) return;

  try {
    if (request.error) {
      statusElement.textContent = '提取内容失败：' + request.error;
      return;
    }

    if (request.data && request.data.success) {
      statusElement.textContent = '正在下载...';
      await chrome.runtime.sendMessage({
        action: 'downloadArticle',
        data: request.data.data
      });
      statusElement.textContent = '下载完成！';
    } else {
      statusElement.textContent = '提取内容失败：' + (request.data ? request.data.error : '未知错误');
    }
  } catch (error) {
    statusElement.textContent = '发生错误：' + error.message;
  }
}

document.getElementById('downloadBtn').addEventListener('click', async () => {
  statusElement = document.getElementById('status');
  
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      statusElement.textContent = '无法获取当前页面信息';
      return;
    }

    currentTabId = tab.id;
    
    if (!tab.url.includes('mp.weixin.qq.com')) {
      statusElement.textContent = '请在微信公众号文章页面使用此插件';
      return;
    }

    // 弹出确认对话框
    if (!confirm('确定要下载当前文章吗？')) {
      return;
    }

    statusElement.textContent = '正在提取文章内容...';
    
    // 向content script发送消息，请求提取文章内容
    let retryCount = 0;
    const maxRetries = 5; // 增加重试次数
    const retryDelay = 1000; // 重试延迟时间（毫秒）

    while (retryCount < maxRetries) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
        return; // 成功发送消息后返回，等待content script的响应
      } catch (err) {
        retryCount++;
        console.log(`尝试连接到页面失败，第${retryCount}次重试...`);
        
        if (retryCount === maxRetries) {
          throw new Error('无法连接到页面，请刷新页面后重试');
        }
        
        // 显示重试状态
        statusElement.textContent = `正在尝试连接到页面...（${retryCount}/${maxRetries}）`;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  } catch (error) {
    statusElement.textContent = '发生错误：' + error.message;
  }
});