#!/usr/bin/env python3
"""Cross-platform launcher for LeetCode Management System.
Works on macOS, Linux, and Windows with Python 3.8+.
"""
import subprocess
import sys
import os
import shutil
import webbrowser
import time

DIR = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(DIR, '.venv')
REQ = os.path.join(DIR, 'requirements.txt')
FRONTEND = os.path.join(DIR, 'frontend')
PORT = 5001


def pip_exe():
    if sys.platform == 'win32':
        return os.path.join(VENV, 'Scripts', 'pip.exe')
    return os.path.join(VENV, 'bin', 'pip')


def python_exe():
    if sys.platform == 'win32':
        return os.path.join(VENV, 'Scripts', 'python.exe')
    return os.path.join(VENV, 'bin', 'python')


def venv_ok():
    """Check the venv actually works, not just that files exist."""
    try:
        subprocess.check_call(
            [python_exe(), '-c', 'import sys'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def setup():
    if not venv_ok():
        import shutil
        if os.path.exists(VENV):
            shutil.rmtree(VENV)
        print('[LMS] Creating virtual environment...')
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])

    print('[LMS] Installing dependencies...')
    subprocess.check_call(
        [python_exe(), '-m', 'pip', 'install', '-q', '-r', REQ],
        stdout=subprocess.DEVNULL,
    )


def build_frontend():
    """Build the React SPA so Flask can serve it. Falls back silently to the
    classic Jinja UI if the frontend or Node/npm isn't available."""
    if not os.path.isdir(FRONTEND):
        return
    npm = shutil.which('npm')
    if not npm:
        print('[LMS] npm not found — serving the classic UI.')
        return
    try:
        if not os.path.isdir(os.path.join(FRONTEND, 'node_modules')):
            print('[LMS] Installing frontend dependencies (first run)...')
            subprocess.check_call([npm, 'install'], cwd=FRONTEND)
        print('[LMS] Building frontend...')
        subprocess.check_call([npm, 'run', 'build'], cwd=FRONTEND)
    except (subprocess.CalledProcessError, OSError) as e:
        print(f'[LMS] Frontend build failed ({e}); serving the classic UI.')


def set_macos_icon():
    """Set the LMS icon on .command file if on macOS and not already set."""
    if sys.platform != 'darwin':
        return
    cmd_file = os.path.join(DIR, 'LMS.command')
    icns = os.path.join(DIR, 'assets', 'logo.icns')
    if not os.path.exists(cmd_file) or not os.path.exists(icns):
        return
    # Check if icon resource fork already exists
    icon_rsrc = cmd_file + '/..namedfork/rsrc'
    if os.path.exists(icon_rsrc) and os.path.getsize(icon_rsrc) > 0:
        return
    try:
        script = (
            'use framework "AppKit"\n'
            f'set iconImage to current application\'s NSImage\'s alloc()\'s initWithContentsOfFile:"{icns}"\n'
            f'current application\'s NSWorkspace\'s sharedWorkspace()\'s setIcon:iconImage forFile:"{cmd_file}" options:0'
        )
        subprocess.run(['osascript', '-l', 'AppleScript', '-e', script],
                       capture_output=True, timeout=5)
    except Exception:
        pass


def main():
    setup()
    build_frontend()
    set_macos_icon()
    url = f'http://localhost:{PORT}'
    print(f'[LMS] Starting server at {url}')

    env = os.environ.copy()
    env['FLASK_APP'] = 'app.py'

    proc = subprocess.Popen(
        [python_exe(), os.path.join(DIR, 'app.py')],
        cwd=DIR,
        env=env,
    )

    time.sleep(1.5)
    webbrowser.open(url)

    try:
        proc.wait()
    except KeyboardInterrupt:
        print('\n[LMS] Shutting down...')
        proc.terminate()


if __name__ == '__main__':
    main()
