#!/usr/bin/env python3
"""Friendly launcher. Credentials live only in this process environment."""
import argparse
import getpass
import os
import webbrowser
from http.server import ThreadingHTTPServer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ai', action='store_true')
    args = parser.parse_args()
    if args.ai and not os.environ.get('OPENAI_API_KEY', '').strip():
        print('输入你的 OpenAI API 密钥（输入时不会显示，也不会保存到文件）。')
        try:
            key = getpass.getpass('API 密钥：').strip()
        except (EOFError, KeyboardInterrupt):
            print('\n已取消。')
            return
        if key:
            os.environ['OPENAI_API_KEY'] = key
        else:
            print('未输入密钥，启动本地构图辅助。')
    from server import Handler
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    url = f'http://127.0.0.1:{server.server_port}'
    print('留白已启动：' + url, flush=True)
    print('AI 模式：' + ('已配置，点击页面上的 AI 按钮后才发送照片。' if os.environ.get('OPENAI_API_KEY', '').strip() else '未配置，本地构图辅助可直接使用。'), flush=True)
    print('关闭此窗口或按 Ctrl+C 停止。', flush=True)
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
