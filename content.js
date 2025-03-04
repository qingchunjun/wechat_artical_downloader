// 初始化日志
console.log('Content script starting...');

// 初始化IndexedDB
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('articleDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('articles')) {
        const store = db.createObjectStore('articles', { keyPath: 'id' });
        // 添加索引以便于查询
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// 压缩图片
async function compressImage(blob) {
  // 如果是GIF格式，直接返回原始blob
  if (blob.type === 'image/gif') {
    return blob;
  }

  try {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = () => {
        img.src = reader.result;
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 计算压缩后的尺寸，保持宽高比
            let width = img.width;
            let height = img.height;
            const maxSize = 1024; // 最大尺寸为1024px
            
            if (width > height && width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // 绘制并压缩图片
            ctx.drawImage(img, 0, 0, width, height);
            
            // 使用Promise包装canvas.toBlob
            canvas.toBlob(
              (compressedBlob) => {
                if (!compressedBlob) {
                  reject(new Error('图片压缩失败：无法创建Blob对象'));
                  return;
                }
                resolve(compressedBlob);
              },
              'image/jpeg',
              0.7 // 压缩质量
            );
          } catch (error) {
            console.error('图片压缩过程出错:', error);
            reject(error);
          }
        };

        img.onerror = () => {
          console.error('图片加载失败');
          reject(new Error('图片加载失败'));
        };
      };

      reader.onerror = () => {
        console.error('读取文件失败');
        reject(new Error('读取文件失败'));
      };

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('图片压缩失败:', error);
    return blob; // 如果压缩过程出错，返回原始blob
  }
}

// 保存数据到IndexedDB
async function saveToIndexedDB(dataId, zipBlob) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['articles'], 'readwrite');
    const store = transaction.objectStore('articles');
    
    // 验证数据完整性
    if (!(zipBlob instanceof Blob)) {
      reject(new Error('无效的数据格式'));
      return;
    }

    // 验证Blob大小
    if (!zipBlob.size || zipBlob.size < 100) {
      reject(new Error(`无效的zip文件大小：${zipBlob.size} 字节`));
      return;
    }

    // 验证MIME类型
    if (!zipBlob.type.includes('zip')) {
      console.warn('警告：Blob类型可能不正确:', zipBlob.type);
    }

    // 验证zip文件的完整性
    JSZip.loadAsync(zipBlob).then(async (zip) => {
      const files = Object.keys(zip.files);
      if (files.length === 0) {
        reject(new Error('zip文件不包含任何内容'));
        return;
      }

      // 验证每个文件的完整性
      for (const file of files) {
        const fileData = await zip.file(file).async('blob');
        if (!fileData || fileData.size === 0) {
          reject(new Error(`zip文件中的 ${file} 数据无效`));
          return;
        }
      }

      const data = {
        id: dataId,
        data: zipBlob,
        timestamp: Date.now(),
        size: zipBlob.size
      };

      const request = store.put(data);
      
      request.onsuccess = () => {
        console.log(`数据保存成功，ID: ${dataId}, 大小: ${zipBlob.size} 字节`);
        resolve(data);
      };
      request.onerror = () => reject(request.error);

    }).catch(error => {
      reject(new Error(`zip文件验证失败: ${error.message}`));
    });

    // 添加事务完成的处理
    transaction.oncomplete = () => {
      console.log('数据保存事务完成');
    };
    transaction.onerror = () => {
      reject(new Error('保存数据事务失败'));
    };
  });
}

// 从IndexedDB读取数据
async function getFromIndexedDB(dataId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['articles'], 'readonly');
    const store = transaction.objectStore('articles');
    const request = store.get(dataId);
    
    request.onsuccess = async () => {
      const result = request.result;
      if (!result) {
        reject(new Error('未找到指定的数据'));
        return;
      }
      if (!(result.data instanceof Blob)) {
        console.error('数据格式错误:', {
          type: Object.prototype.toString.call(result.data),
          hasData: !!result.data
        });
        reject(new Error('数据格式错误'));
        return;
      }

      // 验证Blob大小
      if (!result.data.size || result.data.size < 100) {
        console.error('数据大小异常:', {
          size: result.data.size,
          type: result.data.type
        });
        reject(new Error(`数据大小异常：${result.data.size} 字节`));
        return;
      }

      // 验证数据类型
      if (!result.data.type.includes('zip')) {
        console.warn('数据类型可能不正确:', result.data.type);
      }

      // 验证zip文件的完整性
      try {
        const testZip = new JSZip();
        await testZip.loadAsync(result.data);
        const files = Object.keys(testZip.files);
        
        if (files.length === 0) {
          reject(new Error('zip文件不包含任何内容'));
          return;
        }

        // 验证每个文件的完整性
        for (const file of files) {
          const fileObj = testZip.file(file);
          if (!fileObj) {
            throw new Error(`zip文件中的 ${file} 不存在或无法访问`);
          }
          const fileData = await fileObj.async('blob');
          if (!fileData || fileData.size === 0) {
            throw new Error(`zip文件中的 ${file} 数据无效`);
          }
        }

        // 返回成功响应
        resolve({
          success: true,
          data: result.data
        });
      } catch (error) {
        console.error('zip文件验证失败:', error);
        reject(new Error(`zip文件验证失败: ${error.message}`));
      }
    };

    request.onerror = () => {
      console.error('读取数据失败:', request.error);
      reject(request.error);
    };

    // 添加事务完成的处理
    transaction.oncomplete = () => {
      console.log('数据读取成功，ID:', dataId);
    };
    transaction.onerror = () => {
      console.error('读取数据事务失败:', transaction.error);
      reject(new Error('读取数据事务失败'));
    };
  });
}

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
    const article = document.querySelector('#js_content');
    if (!article) {
      return { success: false, error: '无法找到文章内容' };
    }
    console.log('找到文章内容');

    // 获取文章标题
    const title = document.querySelector('#activity-name')?.textContent.trim() || '未命名文章';
    console.log('文章标题:', title);
    
    // 创建文章文件夹
    let articleFolder = title
      .replace(/[\\/:*?"<>|\[\]{}#%&~`@=+\^·、，。！？；：（）【】《》￥…—]/g, '_') // 替换中英文标点和特殊字符
      .replace(/\s+/g, '_') // 替换空白字符为下划线
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_') // 只保留中英文、数字、下划线和连字符
      .replace(/^[.-]+|[.-]+$/g, '_') // 处理开头和结尾的点号和横线
      .replace(/_{2,}/g, '_') // 将多个连续下划线替换为单个
      .trim(); // 去除首尾空格

    // 限制文件夹名称长度
    if (articleFolder.length > 100) {
      articleFolder = articleFolder.slice(0, 97) + '...';
    }

    // 确保文件夹名不为空
    if (!articleFolder.trim()) {
      articleFolder = '未命名文章_' + Date.now();
    }

    try {
      await chrome.runtime.sendMessage({
        action: 'createDirectory',
        path: articleFolder
      });
      console.log(`创建文章文件夹成功: ${articleFolder}`);
    } catch (error) {
      console.warn(`创建文章文件夹失败: ${articleFolder}`, error);
      return { success: false, error: '创建文章文件夹失败' };
    }

    // 创建媒体文件夹
    const mediaFolders = ['images', 'videos'];
    for (const folder of mediaFolders) {
      try {
        await chrome.runtime.sendMessage({
          action: 'createDirectory',
          path: `${articleFolder}/${folder}`
        });
      } catch (error) {
        console.warn(`创建媒体文件夹失败: ${folder}`, error);
      }
    }
    
    let markdownContent = `# ${title}\n\n`;
    const mediaFiles = [];
    let imageIndex = 0;
    let videoIndex = 0;
    
    // 递归处理DOM节点
    async function processNode(node) {
      let content = '';

      // 处理文本节点
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          content += text + '\n';
        }
        return content;
      }

      // 处理元素节点
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 处理视频
        if (node.tagName === 'VIDEO' && node.src) {
          try {
            console.log(`处理视频 ${videoIndex + 1}`);
            const response = await fetch(node.src);
            const blob = await response.blob();
            
            const extension = blob.type.split('/')[1] || 'mp4';
            const filename = `${articleFolder}/videos/video${videoIndex}.${extension}`;
            
            // 将视频数据转换为base64并通过background script处理下载
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
              reader.onload = async () => {
                try {
                  await chrome.runtime.sendMessage({
                    action: 'downloadMedia',
                    data: {
                      url: reader.result,
                      filename: filename,
                      saveAs: false
                    }
                  });
                  resolve();
                } catch (error) {
                  reject(error);
                }
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            
            console.log(`成功保存视频: ${filename}, 大小: ${blob.size}字节`);
            content += `[视频${videoIndex}](${articleFolder}/videos/video${videoIndex}.${extension})

            `;
            mediaFiles.push({filename, size: blob.size});
            videoIndex++;
          } catch (error) {
            console.error('下载视频失败:', error);
            content += '[视频下载失败]\n\n';
          }
          return content;
        }

        // 处理图片
        if (node.tagName === 'IMG') {
          try {
            const imgUrl = node.dataset.src || node.src;
            if (!imgUrl) {
              console.warn('图片URL不存在，跳过');
              content += '[图片URL不存在]\n\n';
              return content;
            }

            console.log(`处理图片 ${imageIndex + 1}, URL: ${imgUrl}`);
            const response = await fetch(imgUrl);
            let blob = await response.blob();

            if (!blob || blob.size === 0) {
              throw new Error(`图片数据无效: 大小为${blob ? blob.size : 0}字节`);
            }

            const extension = blob.type.split('/')[1] || 'jpg';
            const filename = `${articleFolder}/images/image${imageIndex}.${extension}`;
            
            // 将图片数据转换为base64并通过background script处理下载
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
              reader.onload = async () => {
                try {
                  await chrome.runtime.sendMessage({
                    action: 'downloadMedia',
                    data: {
                      url: reader.result,
                      filename: filename,
                      saveAs: false
                    }
                  });
                  resolve();
                } catch (error) {
                  console.error('发送下载请求失败:', error);
                  reject(error);
                }
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            
            console.log(`成功保存图片: ${filename}, 大小: ${blob.size}字节`);
            content += `![图片${imageIndex}](${articleFolder}/images/image${imageIndex}.${extension})

            `;
            mediaFiles.push({filename, size: blob.size});
            imageIndex++;
          } catch (error) {
            console.error('处理图片失败:', error);
            content += `[图片处理失败: ${error.message}]\n\n`;
          }
          return content;
        }

        // 处理标题
        if (/^H[1-6]$/.test(node.tagName)) {
          const level = node.tagName[1];
          const text = node.textContent.trim();
          if (text) {
            content += '#'.repeat(level) + ' ' + text + '\n\n';
          }
          return content;
        }

        // 处理段落
        if (node.tagName === 'P') {
          content += '\n';
        }

        // 递归处理子节点
        for (const childNode of node.childNodes) {
          if (childNode.nodeType === Node.ELEMENT_NODE && childNode.tagName === 'SCRIPT') {
            continue; // 跳过脚本标签
          }
          content += await processNode(childNode);
        }

        // 段落结束添加额外的换行
        if (node.tagName === 'P') {
          content += '\n';
        }

        return content;
      }

      return '';
    }

    // 处理文章内容
    console.log('处理文本内容...');
    const clonedArticle = article.cloneNode(true);
    clonedArticle.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    markdownContent += await processNode(clonedArticle);

    // 保存Markdown文件到本地文件系统
    const markdownBlob = new Blob([markdownContent], { type: 'text/markdown' });
    try {
      await chrome.runtime.sendMessage({
        action: 'downloadMedia',
        data: {
          url: URL.createObjectURL(markdownBlob),
          filename: `${articleFolder}.md`,
          saveAs: false
        }
      });
      console.log('文章内容保存成功');
    } catch (error) {
      console.error('保存文章内容失败:', error);
    }

    // 返回处理结果
    return {
      success: true,
      data: {
        title,
        content: markdownContent,
        hasMedia: mediaFiles.length > 0,
        mediaFiles
      }
    };
  } catch (error) {
    console.error('提取内容时发生错误:', error);
    return { success: false, error: error.message };
  }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getArticleData') {
    // 立即返回true以保持消息通道开放
    getFromIndexedDB(request.dataId).then(result => {
      if (result && result.data) {
        // 直接使用sendResponse返回数据
        sendResponse({
          success: true,
          data: result.data
        });
      } else {
        sendResponse({
          success: false,
          error: '未找到数据'
        });
      }
    }).catch(error => {
      console.error('获取数据失败:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    return true; // 保持消息通道开放
  }
});

// 保存媒体文件到IndexedDB
async function saveMediaToIndexedDB(filename, blob) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['articles'], 'readwrite');
    const store = transaction.objectStore('articles');
    
    // 验证数据完整性
    if (!(blob instanceof Blob)) {
      reject(new Error('无效的数据格式'));
      return;
    }

    // 验证Blob大小
    if (!blob.size) {
      reject(new Error(`无效的文件大小：${blob.size} 字节`));
      return;
    }

    const data = {
      id: filename,
      data: blob,
      timestamp: Date.now(),
      size: blob.size
    };

    const request = store.put(data);
    
    request.onsuccess = () => {
      console.log(`媒体文件保存成功，文件名: ${filename}, 大小: ${blob.size} 字节`);
      resolve(data);
    };
    request.onerror = () => reject(request.error);

    // 添加事务完成的处理
    transaction.oncomplete = () => {
      console.log('媒体文件保存事务完成');
    };
    transaction.onerror = () => {
      reject(new Error('保存媒体文件事务失败'));
    };
  });
}