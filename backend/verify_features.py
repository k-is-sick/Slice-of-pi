"""
verify_features.py
Launches uvicorn server in same process session, runs Playwright tests for:
1. Suggestion chip clicks (2026, 314159)
2. Position coordinates for ALL numbers in the query
3. UI elements integrity after search (HUD card layout, controls, footer hidden)
4. New Search retry flow
5. Constellation lines toggle
"""

import os
import sys
import time
import socket
import subprocess

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

def wait_for_port(port=8000, timeout=10.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.2)
    return False

def main():
    print("[SERVER] Starting uvicorn server subprocess...")
    backend_dir = os.path.join(os.path.dirname(__file__))
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--port", "8000"],
        cwd=backend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        if not wait_for_port(8000):
            print("[ERROR] Server failed to start on port 8000 within timeout!")
            out, err = server_proc.communicate(timeout=2)
            print("STDOUT:", out.decode(errors="replace"))
            print("STDERR:", err.decode(errors="replace"))
            return 1

        print("[SERVER] Server is live on http://127.0.0.1:8000")

        with sync_playwright() as p:
            print("[BROWSER] Launching Brave browser...")
            browser = p.chromium.launch(executable_path=BRAVE_PATH, headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: console_errors.append(str(err)))

            print("[TEST 1] Loading home page...")
            page.goto("http://127.0.0.1:8000")
            page.wait_for_timeout(1000)

            title = page.text_content(".hero-title")
            print(f"  [OK] Hero title: {title.strip() if title else 'None'}")
            badge = page.text_content(".hero-badge")
            print(f"  [OK] Hero badge: {badge.strip() if badge else 'None'}")

            # 2. Test chip click "2026"
            print("\n[TEST 2] Clicking suggestion chip [data-q='2026']...")
            chip_2026 = page.locator(".chip[data-q='2026']")
            chip_2026.click()

            page.wait_for_selector("#hud:not(.hidden)", timeout=10000)
            print("  [OK] Flight completed, HUD card is visible!")

            headline = page.text_content("#hud-headline")
            print(f"  [OK] Headline: {headline.strip()}")

            # Verify position coordinates for all 4 digits in 2026
            coord_pills = page.locator("#hud-coords-breakdown .coord-pill")
            pill_count = coord_pills.count()
            print(f"  [OK] Coordinate pills count for '2026': {pill_count}")
            assert pill_count == 4, f"Expected 4 coordinate pills for '2026', got {pill_count}"

            for i in range(pill_count):
                txt = coord_pills.nth(i).inner_text().replace("\n", " ")
                print(f"       Digit {i+1}: {txt}")

            # 3. Test UI integrity after search (Strictly NO scroller!)
            print("\n[TEST 3] Checking UI element layout & scroller absence...")
            has_hud = page.evaluate("document.body.classList.contains('has-hud')")
            print(f"  [OK] Body has 'has-hud' class: {has_hud}")

            footer_opacity = page.evaluate("window.getComputedStyle(document.getElementById('footer')).opacity")
            print(f"  [OK] Footer opacity when HUD is active: {footer_opacity}")
            assert footer_opacity == "0", f"Footer should be hidden (opacity 0), got {footer_opacity}"

            btn_count = page.locator("#hud-controls .ctrl-btn").count()
            print(f"  [OK] HUD action buttons count: {btn_count}")
            assert btn_count == 6, f"Expected 6 buttons, got {btn_count}"

            # Strict check: NO SCROLLBAR on HUD card
            overflow_y = page.evaluate("window.getComputedStyle(document.getElementById('hud-card')).overflowY")
            print(f"  [OK] HUD card overflow-y style: {overflow_y}")
            assert overflow_y == "hidden", f"Expected overflow-y: hidden, got {overflow_y}"

            has_scroll = page.evaluate("""() => {
                const el = document.getElementById('hud-card');
                return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
            }""")
            print(f"  [OK] HUD card has any scrollbar: {has_scroll}")
            assert not has_scroll, "HUD card must not have any vertical or horizontal scrollbars!"

            # 4. Test "New Search" flow
            print("\n[TEST 4] Testing 'New Search' button...")
            page.locator("#btn-new-search").click()
            page.wait_for_timeout(500)

            hero_visible = page.evaluate("!document.getElementById('hero').classList.contains('hidden')")
            print(f"  [OK] Hero section restored: {hero_visible}")
            assert hero_visible, "Hero section should be visible after New Search"

            # 5. Test clicking another chip: "314159" (6 digits)
            print("\n[TEST 5] Clicking suggestion chip [data-q='314159']...")
            page.locator(".chip[data-q='314159']").click()
            page.wait_for_selector("#hud:not(.hidden)", timeout=10000)

            headline_pi = page.text_content("#hud-headline")
            print(f"  [OK] Headline: {headline_pi.strip()}")

            pill_count_pi = page.locator("#hud-coords-breakdown .coord-pill").count()
            print(f"  [OK] Coordinate pills count for '314159': {pill_count_pi}")
            assert pill_count_pi == 6, f"Expected 6 coordinate pills for '314159', got {pill_count_pi}"

            coord_pills_pi = page.locator("#hud-coords-breakdown .coord-pill")
            for i in range(pill_count_pi):
                txt = coord_pills_pi.nth(i).inner_text().replace("\n", " ")
                print(f"       Digit {i+1}: {txt}")

            # 6. Test Constellation lines toggle
            print("\n[TEST 6] Testing 'Connect Spiral' constellation toggle...")
            page.locator("#btn-hud-lines").click()
            page.wait_for_timeout(300)
            toast_text = page.text_content("#toast")
            print(f"  [OK] Toast message on toggle: {toast_text.strip()}")

            print(f"\n[CONSOLE ERRORS]: {len(console_errors)}")
            if console_errors:
                for err in console_errors:
                    print(f"  [ERROR] {err}")
                return 1

            print("\n[SUCCESS] ALL VERIFICATION TESTS PASSED PERFECTLY WITH ZERO ERRORS!")
            browser.close()
            return 0

    finally:
        print("[CLEANUP] Stopping server process...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("[CLEANUP] Server stopped cleanly.")

if __name__ == "__main__":
    sys.exit(main())
