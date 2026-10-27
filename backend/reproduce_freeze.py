import time
import sys
from playwright.sync_api import sync_playwright

BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

def test_query(query="2026"):
    print(f"\n==========================================")
    print(f"Testing in Brave: query = '{query}'")
    print(f"==========================================")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=BRAVE_PATH, headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_logs = []
        network_calls = []
        errors = []

        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: errors.append(f"[pageerror] {err}"))
        page.on("request", lambda req: network_calls.append((req.method, req.url)))

        print("Navigating to http://127.0.0.1:8000...")
        page.goto("http://127.0.0.1:8000")
        page.wait_for_timeout(1000)

        # Inject long task observer and rAF frame monitor
        page.evaluate("""() => {
            window.longTasks = [];
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        window.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
                    }
                });
                observer.observe({ entryTypes: ['longtask'] });
            } catch (e) {
                console.error("Longtask observer failed:", e);
            }

            window.frameDeltas = [];
            let last = performance.now();
            function track(now) {
                window.frameDeltas.push(now - last);
                last = now;
                requestAnimationFrame(track);
            }
            requestAnimationFrame(track);
        }""")

        print(f"Typing '{query}' and pressing Enter...")
        t0 = time.time()
        page.fill("#search-input", query)
        page.keyboard.press("Enter")

        hud_visible = False
        for i in range(20): # up to 10 seconds
            page.wait_for_timeout(500)
            elapsed = time.time() - t0
            hud_visible = page.evaluate("!document.getElementById('hud').classList.contains('hidden')")
            if hud_visible:
                print(f"HUD appeared after {elapsed:.2f}s!")
                break
        else:
            print("WATCHDOG: HUD did not appear after 10s!")

        long_tasks = page.evaluate("window.longTasks || []")
        print(f"Long tasks count: {len(long_tasks)}")
        for lt in long_tasks:
            print(f"  Long task: {lt['duration']:.1f}ms at {lt['startTime']:.1f}ms")

        api_calls = [url for m, url in network_calls if "/api/" in url]
        print(f"Total API calls: {len(api_calls)}")
        for url in api_calls:
            print(f"  API: {url}")

        if errors:
            print(f"Errors detected ({len(errors)}):")
            for e in errors:
                print(f"  {e}")
        else:
            print("No window page errors.")

        print(f"Console messages ({len(console_logs)}):")
        for log in console_logs:
            print(f"  {log}")

        browser.close()

if __name__ == "__main__":
    queries = ["2026", "0007", "14159265", "999999999999"] if len(sys.argv) <= 1 else [sys.argv[1]]
    for q in queries:
        test_query(q)

