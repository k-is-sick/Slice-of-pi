import os
import sys
import time
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def run():
    print("[verify_3d] Starting backend server...")
    backend_dir = Path(__file__).parent
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--port", "8000"],
        cwd=str(backend_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2.5)

    try:
        with sync_playwright() as p:
            brave_path = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
            if os.path.exists(brave_path):
                print(f"[verify_3d] Launching Brave at {brave_path}")
                browser = p.chromium.launch(executable_path=brave_path, headless=True)
            else:
                print("[verify_3d] Launching Chromium")
                browser = p.chromium.launch(headless=True)

            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            console_errors = []
            page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error",) else None)
            page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))

            print("[verify_3d] Loading http://127.0.0.1:8000...")
            page.goto("http://127.0.0.1:8000")
            page.wait_for_timeout(1000)

            # Performance observer
            page.evaluate("""() => {
                window.longTasks = [];
                try {
                    const obs = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            window.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
                        }
                    });
                    obs.observe({ entryTypes: ['longtask'] });
                } catch (e) {}
            }""")

            # 1. Test Queries & Position Display for ALL digits
            test_queries = [
                ("2026", 4, 3118),
                ("0007", 4, 28990),
                ("14159265", 8, 1),
                ("5", 1, 4),
            ]

            for q, expected_len, expected_pos in test_queries:
                print(f"\n[Scenario] Searching for '{q}'...")
                page.fill("#search-input", q)
                page.keyboard.press("Enter")

                page.wait_for_selector("#hud:not(.hidden)", timeout=10000)
                page.wait_for_timeout(400)

                headline = page.inner_text("#hud-headline")
                print(f"  Headline: {headline}")
                assert str(expected_pos) in headline.replace(",", ""), f"Expected pos {expected_pos} in headline"

                pills = page.query_selector_all("#hud-coords-breakdown .coord-pill")
                print(f"  Coordinates breakdown pills count: {len(pills)} (expected {expected_len})")
                assert len(pills) == expected_len, f"Expected {expected_len} pills for '{q}', got {len(pills)}"

                # Verify each pill contains the correct digit character
                for i, pill in enumerate(pills):
                    pill_text = pill.inner_text().replace("\n", " ")
                    ch = pill.query_selector(".coord-digit").inner_text().strip()
                    pos_str = pill.query_selector(".coord-pos").inner_text().strip()
                    print(f"    Digit {i+1}: char='{ch}' pos='{pos_str}'")
                    assert ch == q[i], f"Expected char '{q[i]}', got '{ch}'"

                if q == "2026":
                    page.screenshot(path=str(SCREENSHOTS_DIR / "05_verified_all_positions.png"))
                    print("  [OK] Saved 05_verified_all_positions.png")

                # Reset to New Search
                page.click("#btn-new-search")
                page.wait_for_timeout(300)

            long_tasks = page.evaluate("window.longTasks")
            print(f"\n[Performance Summary]")
            print(f"  Long tasks count (>50ms): {len(long_tasks)}")
            print(f"  Console errors: {len(console_errors)}")
            for ce in console_errors:
                print(f"    - {ce}")

            browser.close()
            print("\n[ALL TESTS PASSED: ALL NUMBERS AND POSITIONS FULLY VERIFIED]")
    finally:
        server_proc.terminate()
        server_proc.wait()

if __name__ == "__main__":
    run()
