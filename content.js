// 初始化日志
console.log('Content script starting...');

// 确保页面和扩展API都已准备就绪
function init() {
  let retryCount = 0;
  const maxRetries = 10; // 增加最大重试次数
  const retryDelay = 1000;

  function tryInitialize() {
    if (retryCount >= maxRetries) {
      console.error('初始化失败：无法加载必要的组件');
      return;
    }

    if (typeof JSZip === 'undefined' || !chrome.runtime) {
      retryCount++;
      console.log(`等待组件加载...（${retryCount}/${maxRetries}）`);
      setTimeout(tryInitialize, retryDelay);
      return;
    }

    // 确保DOM已加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeContentScript);
    } else {
      setTimeout(initializeContentScript, 500); // 添加延迟以确保所有组件都已加载
    }
  }

  tryInitialize();
}

init();

function initializeContentScript() {
  try {
    // 验证必要组件是否可用
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip库未能正确加载');
    }
    if (!chrome.runtime) {
      throw new Error('Chrome扩展API未能正确加载');
    }

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractContent') {
        console.log('收到提取内容请求');
        // 立即发送一个确认消息
        sendResponse({ success: true, status: 'processing' });
        
        // 异步处理内容提取
        extractContent().then(result => {
          console.log('内容提取完成:', result);
          // 使用chrome.runtime.sendMessage将结果发送回popup
          chrome.runtime.sendMessage({
            action: 'extractContentResult',
            data: result
          });
        }).catch(error => {
          console.error('内容提取失败:', error);
          chrome.runtime.sendMessage({
            action: 'extractContentResult',
            error: error.message
          });
        });
      }
      return true; // 保持消息通道开放
    });
    console.log('Content script initialized successfully');
  } catch (error) {
    console.error('Content script initialization failed:', error);
  }
}

// 提取文章内容和媒体文件
async function extractContent() {
  console.log('开始提取内容');
  try {
    // 检查JSZip是否正确加载
    if (typeof JSZip === 'undefined') {
      console.error('JSZip库未能正确加载，请刷新页面重试');
      return { success: false, error: 'JSZip库未能正确加载，请刷新页面重试' };
    }
    console.log('JSZip库已正确加载');

    const article = document.querySelector('#js_content');
    if (!article) {
      return { success: false, error: '无法找到文章内容' };
    }
    console.log('找到文章内容');

    // 获取文章标题
    const title = document.querySelector('#activity-name')?.textContent.trim() || '未命名文章';
    console.log('文章标题:', title);
    
    // 创建一个新的JSZip实例
    const zip = new JSZip();
    const mediaFiles = [];
    let markdownContent = `# ${title}\n\n`;

    // 处理图片
    console.log('开始处理图片...');
    const images = article.querySelectorAll('img');
    let imageIndex = 0;
    for (const img of images) {
      if (img.dataset.src) {
        try {
          console.log(`处理图片 ${imageIndex + 1}/${images.length}`);
          const response = await fetch(img.dataset.src);
          const blob = await response.blob();
          const filename = `images/image${imageIndex}.${blob.type.split('/')[1]}`;
          zip.file(filename, blob);
          markdownContent += `![图片${imageIndex}](./${filename})\n\n`;
          mediaFiles.push(filename);
          imageIndex++;
        } catch (error) {
          console.error('下载图片失败:', error);
          markdownContent += `[图片下载失败]\n\n`;
        }
      }
    }

    // 处理视频
    console.log('开始处理视频...');
    const videos = article.querySelectorAll('video');
    let videoIndex = 0;
    for (const video of videos) {
      if (video.src) {
        try {
          console.log(`处理视频 ${videoIndex + 1}/${videos.length}`);
          const response = await fetch(video.src);
          const blob = await response.blob();
          const filename = `videos/video${videoIndex}.${blob.type.split('/')[1]}`;
          zip.file(filename, blob);
          markdownContent += `[视频${videoIndex}](./${filename})\n\n`;
          mediaFiles.push(filename);
          videoIndex++;
        } catch (error) {
          console.error('下载视频失败:', error);
          markdownContent += `[视频下载失败]\n\n`;
        }
      }
    }

    // 处理文本内容
    console.log('处理文本内容...');
    const clonedArticle = article.cloneNode(true);
    // 移除所有脚本标签
    clonedArticle.querySelectorAll('script').forEach(el => el.remove());
    // 移除所有样式
    clonedArticle.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    // 获取纯文本内容
    markdownContent += clonedArticle.innerText;

    // 将Markdown文件添加到zip中
    zip.file('article.md', markdownContent);

    // 如果有媒体文件，返回zip格式，否则只返回markdown
    const data = {
      title,
      content: markdownContent,
      hasMedia: mediaFiles.length > 0
    };

    if (mediaFiles.length > 0) {
      console.log('生成zip文件...');
      // 确保生成的是有效的Blob对象
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });
      // 验证生成的Blob对象
      if (!(zipBlob instanceof Blob)) {
        throw new Error('生成zip文件失败：无效的Blob对象');
      }
      // 将Blob转换为ArrayBuffer以确保数据传输的完整性
      const arrayBuffer = await zipBlob.arrayBuffer();
      data.zipBlob = {
        data: Array.from(new Uint8Array(arrayBuffer)),
        type: zipBlob.type
      };
    }

    console.log('内容提取完成');
    return { success: true, data };
  } catch (error) {
    console.error('提取内容时发生错误:', error);
    return { success: false, error: error.message };
  }
}