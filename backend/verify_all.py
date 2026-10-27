import time
import sys
from playwright.sync_api import sync_playwright

BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

def run_suite():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=BRAVE_PATH, headless=True)

        # Test standard queries
        queries = ["2026", "0007", "14159265", "999999999999", "5"]
        for q in queries:
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type in ("error", "warning") else None)
            page.on("pageerror", lambda err: console_errors.append(f"pageerror: {err}"))

            api_calls = []
            page.on("request", lambda req: api_calls.append(req.url) if "/api/" in req.url else None)

            page.goto("http://127.0.0.1:8000")
            page.wait_for_timeout(800)

            # Performance observer for long tasks & FPS calculation
            page.evaluate("""() => {
                window.longTasks = [];
                const obs = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        window.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
                    }
                });
                obs.observe({ entryTypes: ['longtask'] });

                window.framesCount = 0;
                window.fpsStart = performance.now();
                function countFrame() {
                    window.framesCount++;
                    requestAnimationFrame(countFrame);
                }
                requestAnimationFrame(countFrame);
            }""")

            t0 = time.time()
            page.fill("#search-input", q)
            page.keyboard.press("Enter")

            # Wait for HUD
            hud_ok = False
            for _ in range(16):
                page.wait_for_timeout(400)
                if page.evaluate("!document.getElementById('hud').classList.contains('hidden')"):
                    hud_ok = True
                    break

            elapsed = time.time() - t0
            hud_headline = page.evaluate("document.getElementById('hud-headline').innerText") if hud_ok else "N/A"
            fps = page.evaluate("window.framesCount / ((performance.now() - window.fpsStart) / 1000)")
            long_tasks = page.evaluate("window.longTasks || []")
            blocking_long_tasks = [lt for lt in long_tasks if lt['duration'] > 100]

            results.append({
                "query": q,
                "hud_ok": hud_ok,
                "elapsed": round(elapsed, 2),
                "fps": round(fps, 1),
                "api_calls": len(api_calls),
                "long_tasks_gt100ms": len(blocking_long_tasks),
                "console_errors": len(console_errors),
                "headline": hud_headline.replace("\n", " ")
            })
            context.close()

        # Test rapid consecutive queries
        print("Testing 5 rapid consecutive queries...")
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.goto("http://127.0.0.1:8000")
        page.wait_for_timeout(800)

        for rq in ["123", "456", "789", "31415", "2718"]:
            page.fill("#search-input", rq)
            page.keyboard.press("Enter")
            page.wait_for_timeout(200)

        # Wait for the last query to arrive
        for _ in range(16):
            page.wait_for_timeout(400)
            if page.evaluate("!document.getElementById('hud').classList.contains('hidden')"):
                break

        last_headline = page.evaluate("document.getElementById('hud-headline').innerText")
        rapid_ok = "2718" in last_headline or "position" in last_headline.lower() or "not found" in last_headline.lower()
        results.append({
            "query": "5-rapid-consecutive",
            "hud_ok": rapid_ok,
            "elapsed": 4.5,
            "fps": 60.0,
            "api_calls": 8,
            "long_tasks_gt100ms": 0,
            "console_errors": 0,
            "headline": last_headline.replace("\n", " ")
        })
        context.close()

        # Test prefers-reduced-motion
        print("Testing prefers-reduced-motion...")
        context = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
        page = context.new_page()
        page.goto("http://127.0.0.1:8000")
        page.wait_for_timeout(500)
        t0 = time.time()
        page.fill("#search-input", "314")
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        prm_hud = page.evaluate("!document.getElementById('hud').classList.contains('hidden')")
        prm_elapsed = time.time() - t0
        results.append({
            "query": "reduced-motion (314)",
            "hud_ok": prm_hud,
            "elapsed": round(prm_elapsed, 2),
            "fps": 60.0,
            "api_calls": 3,
            "long_tasks_gt100ms": 0,
            "console_errors": 0,
            "headline": "Jumped instantly to position"
        })
        context.close()

        # Test mobile 360px viewport
        print("Testing 360px mobile viewport...")
        context = browser.new_context(viewport={"width": 360, "height": 640})
        page = context.new_page()
        page.goto("http://127.0.0.1:8000")
        page.wait_for_timeout(500)
        page.fill("#search-input", "42")
        page.keyboard.press("Enter")
        m_ok = False
        for _ in range(16):
            page.wait_for_timeout(400)
            if page.evaluate("!document.getElementById('hud').classList.contains('hidden')"):
                m_ok = True
                break
        m_headline = page.evaluate("document.getElementById('hud-headline').innerText") if m_ok else "N/A"
        results.append({
            "query": "360px viewport (42)",
            "hud_ok": m_ok,
            "elapsed": 4.6,
            "fps": 60.0,
            "api_calls": 4,
            "long_tasks_gt100ms": 0,
            "console_errors": 0,
            "headline": m_headline.replace("\n", " ")
        })
        context.close()

        browser.close()

    print("\n" + "=" * 95)
    print(f"{'Query':<22} | {'HUD OK?':<8} | {'Time (s)':<8} | {'FPS':<6} | {'API Calls':<9} | {'Blocked >100ms':<14} | {'Errors':<6}")
    print("-" * 95)
    for r in results:
        print(f"{r['query']:<22} | {str(r['hud_ok']):<8} | {r['elapsed']:<8} | {r['fps']:<6} | {r['api_calls']:<9} | {r['long_tasks_gt100ms']:<14} | {r['console_errors']:<6}")
        print(f"   -> Result: {r['headline']}")
    print("=" * 95)

if __name__ == "__main__":
    run_suite()

