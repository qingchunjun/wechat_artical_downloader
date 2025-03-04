# 微信公众号文章下载器

一个Chrome扩展程序，用于将微信公众号文章下载为Markdown格式，并支持图片和视频资源的下载。

# 主要功能

- 将微信公众号文章转换为Markdown格式
- 下载文章中的图片和视频资源
- 将所有内容打包成ZIP文件
- 保持原文排版和布局

# 使用方法

1. 在Chrome浏览器中安装扩展
2. 打开微信公众号文章页面
3. 点击扩展图标，选择下载选项
4. 等待下载完成

# 版本更新

## v1.2.1
- 修复了图片路径处理问题
- 优化了文件夹命名规则
- 删除了项目源码中的冗余文件
- 提升了代码的整体可维护性

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

# 技术栈

- JavaScript
- Chrome Extension API
- JSZip（用于文件压缩）
