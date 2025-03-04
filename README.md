# 微信公众号文章下载器

这是一个Chrome扩展程序，可以帮助用户轻松下载微信公众号文章的内容，包括文字、图片和视频，并将其保存为Markdown格式。

# 功能特性

- 一键提取微信公众号文章内容
- 自动下载文章中的图片和视频
- 将文章转换为Markdown格式
- 支持打包下载（包含媒体文件的ZIP压缩包）
- 保持文章的基本格式和结构

# 版本更新

## v1.2.1
<<<<<<< Updated upstream
- 删除了项目源文件中的images文件夹
=======
- 删除了源码中的images目录
>>>>>>> Stashed changes

## v1.2.0
- 优化了文件下载处理逻辑，提高下载成功率
- 改进了ZIP文件的处理方式，确保大文件的稳定下载
- 增加了下载状态提示，提升用户体验

## v1.1.0
- 优化了内容提取逻辑，确保图片和文本在markdown文件中的位置与原文保持一致
- 改进了DOM节点处理方式，更好地保持了文章的原始布局
- 增强了错误处理和重试机制，提高了稳定性

## v1.0.0
- 初始版本发布
- 支持提取文章文本内容
- 支持下载文章中的图片和视频
- 支持将内容打包为ZIP文件下载

# 安装方法

1. 下载本项目的代码
2. 打开Chrome浏览器，进入扩展程序管理页面（chrome://extensions/）
3. 开启开发者模式
4. 点击"加载已解压的扩展程序"，选择项目文件夹

# 使用方法

1. 打开任意微信公众号文章页面
2. 点击Chrome工具栏中的扩展图标
3. 在弹出的窗口中点击"下载文章"按钮
4. 选择保存位置，等待下载完成

# 技术栈

- JavaScript
- Chrome Extension API
- JSZip（用于文件压缩）

# 注意事项

- 仅支持微信公众号文章页面
- 需要保持网络连接以下载媒体文件
- 某些特殊格式的内容可能无法完全保留原始样式

# 许可证

MIT License
