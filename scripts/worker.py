#!/usr/bin/env python3
"""
Python Worker for Warmer Pool
stdin으로 JSON 코드 수신 → exec 실행 → stdout으로 JSON 결과 반환

Security note: This worker uses Python's exec() in a controlled subprocess
environment with pre-validated code from the application layer. Code validation
happens in lib/executor.ts before reaching this worker.
"""
import sys
import json
import traceback
import io
from contextlib import redirect_stdout, redirect_stderr

# Pre-import heavy dependencies to warm up
import pandas as pd
import numpy as np
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except ImportError:
    pass

def execute_code(code: str) -> dict:
    """Execute Python code and capture output"""
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    # Create execution context with pre-imported modules
    exec_globals = {
        '__builtins__': __builtins__,
        'pd': pd,
        'np': np,
    }

    try:
        import matplotlib.pyplot as plt
        exec_globals['plt'] = plt
    except ImportError:
        pass

    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            # Code is pre-validated by lib/executor.ts validateCode()
            exec(code, exec_globals)

        return {
            'stdout': stdout_capture.getvalue(),
            'stderr': stderr_capture.getvalue(),
            'exitCode': 0,
        }
    except Exception as e:
        return {
            'stdout': stdout_capture.getvalue(),
            'stderr': f"{stderr_capture.getvalue()}\n{traceback.format_exc()}",
            'exitCode': 1,
        }
    finally:
        # Clear matplotlib state for next execution
        try:
            plt.close('all')
        except:
            pass

def main():
    # Signal readiness
    print("WORKER_READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            code = request.get('code', '')

            if request.get('type') == 'ping':
                print(json.dumps({'type': 'pong'}), flush=True)
                continue

            if request.get('type') == 'shutdown':
                break

            result = execute_code(code)
            print(json.dumps(result), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({
                'stdout': '',
                'stderr': 'Invalid JSON input',
                'exitCode': 1,
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                'stdout': '',
                'stderr': str(e),
                'exitCode': 1,
            }), flush=True)

        # Signal ready for next task
        print("WORKER_READY", flush=True)

if __name__ == '__main__':
    main()
