import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 不使用 StrictMode：避免开发模式下摄像头/管线双初始化（生产环境无此问题）
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
