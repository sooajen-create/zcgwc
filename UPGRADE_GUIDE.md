# 拾物 Shelf — 自动读取商品信息版

## 这次增加了什么
粘贴商品链接后，前端向独立后端发起请求。后端读取公开 HTML 中的 Open Graph / Twitter Meta / JSON-LD Product 数据，提取标题、图片、价格、币种、店铺和描述，前端根据标题与描述尝试分类。批量链接依次处理。读取失败仍保留商品链接，备注写明失败原因，不再自动弹出手动编辑窗口。

## 第一步：更新 GitHub
把 `shop_shelf` 目录下的 `index.html`、`styles.css`、`app.js`、`supabase_schema.sql`、`README.md`、`UPGRADE_GUIDE.md` 以及整个 `backend` 文件夹上传到仓库 `sooajen-create/zcgwc` 的根目录，替换同名文件。**不要把 `shop_shelf` 文件夹本身嵌套到仓库根目录**。

## 第二步：部署后端到 Render
1. 登录 https://dashboard.render.com/ ，连接 GitHub。
2. New → Web Service → 选择仓库 `sooajen-create/zcgwc`。
3. Runtime 选择 Node；Root Directory 填 `backend`。
4. Build Command 填 `npm install`；Start Command 填 `npm start`。
5. 如果有 Free 实例选项，选择 Free。Render 免费实例可能休眠，第一次请求可能较慢；以 Render 当前展示的价格和配额为准。
6. 部署完成后，得到形如 `https://你的服务.onrender.com` 的网址；浏览器打开 `https://你的服务.onrender.com/health` 应显示 `{ "ok": true }`。
7. 可选安全设置：Render 的环境变量 `FRONTEND_ORIGIN` 设置成 `https://sooajen-create.github.io`，只允许你的前端网页跨域调用。注意 CORS 并不等于真正的后端访问控制。

## 第三步：在网站中连接后端
打开 GitHub Pages 网站 → 设置与云端同步 → 找到「商品识别服务 URL（Render 后端）」 → 填入 Render 服务网址（不要加 `/api/extract`）→ 点击「保存商品识别服务地址」。然后粘贴商品链接测试。

## 注意
- 拼多多、淘宝等平台可能需要登录、动态渲染或阻止自动访问，本后端不绕过登录或反爬保护，无法保证识别成功。
- 商品分类基于关键词，不是 AI 视觉识别；不确定时进入待整理。价格可能因地区、促销、会员而变化。
- 这是公开元数据提取器，不会自动读取评论、全网口碑，也不会上传商品图片到云存储。
- 公开部署时请考虑服务滥用和抓取网站的使用条款。示例含简单限流和内部地址防护，但不应当作生产级安全隔离；对外开放前建议采用严格域名白名单和专门的安全出口策略。
- Supabase 云端同步仍需单独配置；Render 仅负责读取网页，不存储收藏。
