# CAL·INDEX 热量大盘

把每日热量摄入和消耗变成一张个人行情盘。红色代表摄入，绿色代表消耗，方块面积对应热量绝对值。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run lint
npm run test
npm run build
```

数据默认保存在当前浏览器的 IndexedDB 中，不会上传到服务器。基础代谢和运动消耗均为估算值，本项目不提供医疗建议。
