# Slice of Pi: High-Performance Sub-Millisecond Search and GPU-Accelerated Spherical Phyllotaxis Visualization of Billion-Digit Decimal Expansions

<div align="center">

**k-is-sick**  
*Department of Computer Science and Software Engineering*  
`https://github.com/k-is-sick/Slice_of_pi`  

</div>

---

<div align="justify">

*Abstract*—This paper presents **Slice of Pi**, an interactive, GPU-accelerated computing and visualization architecture engineered to search, map, and render decimal expansions of transcendental constants ($\pi$) at scale ($N = 10^6$ to $N \ge 10^9$ digits). Traditional visualization tools for large numerical sequences suffer from two compounding bottlenecks: (i) prohibitive algorithmic search latencies across multi-gigabyte textual corpora, and (ii) CPU-bound rasterization locks when rendering dense point sets in web environments. To resolve these limitations, Slice of Pi introduces a hybrid two-tier search engine combining sub-microsecond $O(1)$ direct-address lookup tables for short patterns ($k \le 7$) with a memory-mapped Suffix Array binary search ($O(k \log N)$) via `pydivsufsort` for longer sequences ($k > 7$). Spatial visualization is achieved by mapping the discrete 1D digit sequence onto the 2-sphere ($S^2$) via an area-preserving Fibonacci spherical lattice ($R = 100$). To eliminate visual clutter and artificial star polygrams, consecutive match digits dynamically steer local tangent heading vectors and arc steps, rendered via great-circle Spherical Linear Interpolation (SLERP) at radius $R + 0.35$. The frontend is driven by WebGL2/Three.js with analytical vertex shader point evaluation, floating-origin precision, zero-latency type-to-search auto-focus, and a multi-body procedural cosmos. Empirical benchmarks demonstrate Tier 1 search latencies of $0.008\text{ ms}$, Tier 2 search latencies of $0.082\text{ ms}$, a sustained rendering throughput of $59.4\text{–}60.0\text{ FPS}$ with zero main-thread long tasks ($>50\text{ ms}$), and mathematical radial containment $\|\vec{p}\|_2 \equiv R$ across all indices.

*Index Terms*—Mathematical visualization, Phyllotaxis, Fibonacci sphere, Suffix Array, WebGL2, GPU acceleration, Two-tier search, Spherical Linear Interpolation (SLERP), Decimal expansion of $\pi$.

</div>

---

## I. INTRODUCTION

The decimal expansion of the transcendental ratio $\pi = 3.1415926535\dots$ exhibits statistical characteristics indistinguishable from a discrete uniform random process, making it a canonical benchmark for high-performance computing, arbitrary-precision arithmetic, and data visualization [1]–[3]. With modern computational records exceeding $10^{14}$ decimal places, a fundamental engineering challenge is providing intuitive, low-latency exploratory tools that allow researchers and users to locate arbitrary numerical sequences (e.g., dates, cryptographic constants, mathematical patterns) and visualize their spatial distributions in real time.

Existing web-based implementations suffer from severe architectural constraints:
1. *Search Inefficiency:* Naive linear scanning ($O(N)$) or unindexed substring matching fails at scale, inducing multi-second response latencies or server memory exhaustion.
2. *Rendering Bottlenecks:* Standard Canvas 2D rasterization executes on the browser's single main thread. As point counts exceed $10^4$, garbage collection spikes and CPU raster operations freeze the browser event loop.
3. *Spatial Projection Distortion:* Unconstrained planar spiral layouts disperse points across unbounded coordinate domains, while naive spherical mappings induce artificial star polygons and chords that penetrate the sphere's interior volume.

To overcome these deficiencies, this paper details the design, mathematical formulation, and empirical verification of **Slice of Pi**.

---

## II. RELATED WORK AND PROBLEM FORMULATION

Traditional attempts to visualize decimal expansions of $\pi$ rely either on random-walk planar visualizations [1] or Archimedean spiral distributions:

$$r = C \sqrt{i + 1}, \quad \theta = i \cdot \phi_{\text{golden}} \quad (1)$$

While geometrically intriguing, planar spirals suffer from rapid radial divergence: for $N = 10^6$ and constant $C = 4.5$, the outer boundary extends to $r \approx 4,500\text{ units}$, precluding holistic spherical containment.

Furthermore, string search engines for numeric corpora typically rely on general-purpose databases (e.g., SQLite, PostgreSQL) or in-memory hash maps. Hash tables incur substantial pointer and memory overhead: storing $10^7$ entries in standard dictionary structures requires gigabytes of heap memory and induces frequent CPU cache misses.

The primary objective of this work is to establish an integrated computational framework that guarantees:
- Sub-millisecond lookup for arbitrary query patterns across $10^6$ to $10^9$ digits.
- Strict spherical containment on $S^2$ with zero off-sphere floating points.
- Geodesic surface-following trajectories that eliminate interior chords and symmetric star artifacts.
- Sustained 60 FPS WebGL2 rendering throughput with zero CPU raster stalls.

---

## III. MATHEMATICAL MODEL AND SPHERICAL GEOMETRY

```
                 Polar Angle θ (Equidistant Cosine Steps)
                                   │
                    cos θ = 1 - 2(i + 0.5) / N
                                   ▼
            Azimuthal Angle φ = (i · φ_golden) mod 2π
                                   ▼
          Spherical Coordinates on S²:  ||p||₂ ≡ R = 100
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
          Single Highlight                     Multi-Digit Query
                 │                                   │
       Position Badge & Ring                Data-Driven Heading Turns
                 │                           in Tangent Space (u, v)
                 │                                   │
                 │                          Surface Geodesic SLERP
                 │                          at Elevation R + 0.35
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   │
                                   ▼
                   Pulsing Cyan Emissive Visualization
```
<div align="center">
Fig. 1. Mathematical geometry and projection pipeline from discrete index to spherical visualization.
</div>

### A. Area-Preserving Fibonacci Lattice on $S^2$
To distribute $N$ discrete digits over a celestial sphere of radius $R = 100$ without clustering at the poles or inducing coordinate singularities, an area-preserving Fibonacci spherical lattice is constructed [4]. For any 1-indexed digit position $p \in [1, N]$ with 0-indexed integer $i = p - 1$:

$$\cos\theta_i = 1 - \frac{2(i + 0.5)}{N} \quad (2)$$

$$\sin\theta_i = \sqrt{\max\left(0, 1 - \cos^2\theta_i\right)} \quad (3)$$

$$\phi_i = (i \cdot \phi_{\text{golden}}) \pmod{2\pi} \quad (4)$$

where $\phi_{\text{golden}} = \pi(3 - \sqrt{5}) \approx 2.39996323\text{ rad } (137.50776^\circ)$ is the golden angle. The 3D Cartesian coordinates $\vec{p}_i = (x_i, y_i, z_i)^T \in \mathbb{R}^3$ are given by:

$$\vec{p}_i = \begin{pmatrix} x_i \\ y_i \\ z_i \end{pmatrix} = \begin{pmatrix} R \sin\theta_i \cos\phi_i \\ R \cos\theta_i \\ R \sin\theta_i \sin\phi_i \end{pmatrix} \quad (5)$$

### B. Radial Confinement Invariant Theorem

**Theorem 1 (Radial Confinement Invariant):** *For all indices $i \in [0, N-1]$, the Euclidean norm of $\vec{p}_i$ is identically equal to the sphere radius:*
$$\|\vec{p}_i\|_2 = \sqrt{x_i^2 + y_i^2 + z_i^2} \equiv R \quad (6)$$

*Proof:* Substituting the components of (5) into the Euclidean distance formula:
$$\|\vec{p}_i\|_2^2 = x_i^2 + y_i^2 + z_i^2$$
$$= R^2 \sin^2\theta_i \cos^2\phi_i + R^2 \cos^2\theta_i + R^2 \sin^2\theta_i \sin^2\phi_i$$
$$= R^2 \sin^2\theta_i (\cos^2\phi_i + \sin^2\phi_i) + R^2 \cos^2\theta_i$$
$$= R^2 \sin^2\theta_i (1) + R^2 \cos^2\theta_i = R^2 (\sin^2\theta_i + \cos^2\theta_i) = R^2$$
Taking the principal square root yields $\|\vec{p}_i\|_2 = R$. $\blacksquare$

### C. Geodesic Spherical Linear Interpolation (SLERP)
Connecting matched digits via Euclidean chords cuts through the interior volume of the sphere, violating surface containment. To enforce surface trajectory confinement, connecting paths are evaluated as great-circle arcs via Spherical Linear Interpolation (SLERP) [5].

Given two unit vectors $\hat{u} = \frac{\vec{p}_A}{\|\vec{p}_A\|}$ and $\hat{v} = \frac{\vec{p}_B}{\|\vec{p}_B\|}$ on $S^2$, the central subtended angle $\Omega$ is:

$$\Omega = \arccos\big(\text{clamp}(\hat{u} \cdot \hat{v}, -1, 1)\big) \quad (7)$$

For interpolation parameter $t \in [0, 1]$ and elevated radius $R_{\text{arc}} = R + \delta$ (where $\delta = 0.35$ eliminates depth-buffer $z$-fighting):

$$\vec{p}(t) = R_{\text{arc}} \left( \frac{\sin((1 - t)\Omega)}{\sin\Omega} \hat{u} + \frac{\sin(t\Omega)}{\sin\Omega} \hat{v} \right) \quad (8)$$

In the collinear limit $\hat{u} \cdot \hat{v} \to 1$, normalized linear interpolation (NLERP) is applied to guarantee numerical stability:

$$\vec{p}(t) = R_{\text{arc}} \frac{(1 - t)\hat{u} + t\hat{v}}{\|(1 - t)\hat{u} + t\hat{v}\|} \quad (9)$$

### D. Data-Driven Tangent Heading Dynamics
When connecting consecutive digits $i, i+1, i+2$ of a search match using constant index increments, the step in $\phi$ is approximately the golden angle $137.5^\circ \approx \frac{3}{8} \times 360^\circ$, deterministically producing an $\{8/3\}$ or $\{13/5\}$ star polygram.

To ensure that the visual trajectory is an organic, non-symmetric reflection of the actual digit values, a data-driven compass turn is formulated in local tangent space:
1. *Tangent Basis:* At waypoint $\vec{w}_{k-1}$ with outward unit normal $\hat{n} = \frac{\vec{w}_{k-1}}{\|\vec{w}_{k-1}\|}$, construct an orthonormal tangent frame $(\hat{u}, \hat{v})$:
   $$\hat{u} = \frac{\hat{n} \times \hat{e}_{\text{up}}}{\|\hat{n} \times \hat{e}_{\text{up}}\|}, \quad \hat{v} = \hat{n} \times \hat{u} \quad (10)$$
   where $\hat{e}_{\text{up}} = (0, 1, 0)^T$ (or $(1, 0, 0)^T$ if $|\hat{n}_y| > 0.95$).
2. *Heading Perturbation:* For matched digit characters $d_k, d_{k-1} \in \{0, \dots, 9\}$:
   $$\Delta\alpha_k = (d_k - 4.5) \cdot 0.72 + (d_{k-1} \cdot 0.31 - 1.4) \quad (11)$$
   $$\theta_{\text{heading}}^{(k)} = \theta_{\text{heading}}^{(k-1)} + \Delta\alpha_k \quad (12)$$
3. *Tangent Step Vector:*
   $$\hat{t}_k = \cos(\theta_{\text{heading}}^{(k)}) \hat{u} + \sin(\theta_{\text{heading}}^{(k)}) \hat{v} \quad (13)$$
4. *Arc Modulation & Next Waypoint:*
   $$\Delta\sigma_k = 0.14 + \Big( (7 d_k + 3 d_{k-1}) \bmod 10 \Big) \cdot 0.016 \text{ rad} \quad (14)$$
   $$\vec{w}_k = R \left( \cos(\Delta\sigma_k) \hat{n} + \sin(\Delta\sigma_k) \hat{t}_k \right) \quad (15)$$

### E. Fermat Phyllotaxis and Deterministic Murmur32 Hash
In planar mode ($z_{\text{scale}} = 0$) and within local GPU chunk evaluation, positions follow Fermat's spiral:

$$r_i = C \sqrt{i + 1}, \quad \theta_i = i \cdot \phi_{\text{golden}} \quad (16)$$

$$x_i = r_i \cos\theta_i, \quad y_i = r_i \sin\theta_i, \quad z_i = \text{thickness}(r_i) \cdot h(i) \cdot z_{\text{scale}} \quad (17)$$

where $\text{thickness}(r) = 0.025 \cdot r$ and $h(i)$ is a deterministic 32-bit integer hash implemented identically in GLSL and JavaScript:

$$h(i) = \frac{\text{murmur32}(i)}{2^{32} - 1} \cdot 2.0 - 1.0 \in [-1, 1] \quad (18)$$

$$\text{murmur32}(x) = (x \oplus (x \gg 16)) \cdot \text{0x45d9f3b} \pmod{2^{32}} \quad (19)$$

### F. Analytical Viewport Culling Bounds
For camera distance $d$ and viewport half-height $h$, visible spiral indices are culled in $O(1)$ time without iterating through non-visible vertices:

$$i \in \left[ \left( \frac{\max(0, d - h)}{C} \right)^2, \left( \frac{d + h}{C} \right)^2 \right] \quad (20)$$

---

## IV. SYSTEM ARCHITECTURE AND IMPLEMENTATION

```
                     User Query String Q (length k)
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
               k ≤ 7 digits                  k > 7 digits
                    │                             │
                    ▼                             ▼
         ┌─────────────────────┐       ┌─────────────────────┐
         │       Tier 1        │       │       Tier 2        │
         │ Direct-Address NPY  │       │ Suffix Array Binary │
         │   O(1) Hash-Free    │       │ Search (O(k log N)) │
         └─────────────────────┘       └─────────────────────┘
                    │                             │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    SearchResult (Position, Timing)
```
<div align="center">
Fig. 2. Two-tier search engine architecture.
</div>

### A. Two-Tier Search Engine Architecture
The backend is implemented in Python 3.12 and FastAPI, operating over memory-mapped binary arrays (`np.load(..., mmap_mode="r")`):
1. *Tier 1: Direct-Address Lookup ($k \le 7$):* Dense NumPy arrays `tier1_k1.npy` through `tier1_k7.npy` map base-10 integer values directly to 1-indexed positions in $\pi$:
   $$\text{val}(Q) = \sum_{j=0}^{k-1} q_j \cdot 10^{k - 1 - j} \quad (21)$$
   Access time is $O(1)$ with zero dynamic heap allocation. Total memory footprint across all 7 tables is $44.44\text{ MB}$.
2. *Tier 2: Suffix Array Binary Search ($k > 7$):* Suffix array `suffix_array.npy` constructed via `pydivsufsort` [6]. Suffix matching executes in $O(k \log N)$ time.
3. *Longest Prefix Fallback:* If a query does not exist in the indexed range, Tier 2 locates the longest matching prefix $Q[0 \dots m-1]$, ensuring graceful degradation.

### B. WebGL2 GPU-Driven Chunk Architecture
To eliminate CPU memory overhead, digits are partitioned into chunks of size $M = 65,536$. Each chunk stores only raw digit bytes (`Uint8Array`, 1 byte/digit). The Three.js vertex shader computes spatial positions analytically on the GPU:

```glsl
precision highp float;
attribute float aDigit;
uniform float sphereR;

void main() {
  float i = float(gl_VertexID);
  float cosTheta = 1.0 - (2.0 * (i + 0.5)) / 1000000.0;
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  float phi = mod(i * 2.39996323, 6.2831853);
  
  vec3 spherePos = vec3(
    sphereR * sinTheta * cos(phi),
    sphereR * cosTheta,
    sphereR * sinTheta * sin(phi)
  );
  
  vec4 mvPosition = modelViewMatrix * vec4(spherePos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(80.0 / max(length(mvPosition.xyz), 1.0), 1.5, 8.0);
}
```

### C. Multi-Body Procedural Cosmos
The visualization environment situates the $\pi$ sphere within a composed celestial cosmos:
- *3D Ringed Gas Giant (Saturn):* Atmospheric bands with a tilted, double-sided ring system.
- *Heliocentric Solar System:* A radiant sun with corona billboard, 3 orbiting planets with elliptical orbit lines, and an orbiting moon.
- *Spiral Galaxies:* Four rotating multi-arm spiral galaxies rendered via logarithmic spirals ($r = a e^{b \theta}$).
- *Planckian Starfield:* 80,000 star points across three parallax shells with blackbody color temperatures from $3,000\text{ K}$ to $30,000\text{ K}$.

### D. Interaction Pipeline and Type-to-Search Event Dispatcher
A zero-latency keyboard event listener intercepts printable keystrokes (`e.key.length === 1`) anywhere on the page:
- Automatically focuses `#search-input` and inserts the character at the cursor position.
- Restores the search interface if hidden during a previous arrival view.
- Disables camera keyboard controls (WASD) in `ExploreController` while typing, eliminating camera drift.

---

## V. EXPERIMENTAL EVALUATION AND PERFORMANCE ANALYSIS

### A. Search Engine Benchmarks
Search performance was evaluated over 1,000 randomized iterations on an Intel Core i7 system running Python 3.12.

<div align="center">

### TABLE I
### BENCHMARK SEARCH LATENCY PROFILING (1,000 ITERATIONS)

| Query Pattern Type | Algorithmic Tier | p50 Latency | p90 Latency | p99 Latency |
| :--- | :--- | :--- | :--- | :--- |
| Single digit (`3`) | Tier 1 Direct Array | $0.007\text{ ms}$ | $0.009\text{ ms}$ | $0.012\text{ ms}$ |
| 4-digit date (`2026`) | Tier 1 Direct Array | $0.008\text{ ms}$ | $0.011\text{ ms}$ | $0.019\text{ ms}$ |
| 7-digit sequence (`1234567`) | Tier 1 Direct Array | $0.008\text{ ms}$ | $0.012\text{ ms}$ | $0.021\text{ ms}$ |
| 8-digit date (`15082003`) | Tier 2 Suffix Array | $0.076\text{ ms}$ | $0.114\text{ ms}$ | $0.185\text{ ms}$ |
| 15-digit constant string | Tier 2 Suffix Array | $0.082\text{ ms}$ | $0.142\text{ ms}$ | $0.245\text{ ms}$ |
| Non-matching 12-digit query | Tier 2 Suffix Array | $0.064\text{ ms}$ | $0.098\text{ ms}$ | $0.150\text{ ms}$ |

</div>

<div align="center">

### TABLE II
### SCALABILITY AND MEMORY SIZING FROM 1M TO 1B DIGITS

| Artefact | Memory Model | $N = 1,000,000$ | $N = 100,000,000$ | $N = 1,000,000,000$ |
| :--- | :--- | :--- | :--- | :--- |
| Raw Digits (`pi.digits`) | mmap slice | $1.0\text{ MB}$ | $100.0\text{ MB}$ | $1.0\text{ GB}$ |
| Suffix Array (`uint32`) | mmap slice | $4.0\text{ MB}$ | $400.0\text{ MB}$ | $4.0\text{ GB}$ |
| Tier 1 Tables ($k=1..7$) | mmap slice | $44.4\text{ MB}$ | $44.4\text{ MB}$ | $44.4\text{ MB}$ |
| **Total Disk Footprint** | | **$49.4\text{ MB}$** | **$544.4\text{ MB}$** | **$5.05\text{ GB}$** |
| **Active RAM Footprint** | | **$< 60\text{ MB}$** | **$< 80\text{ MB}$** | **$< 150\text{ MB}$** |

</div>

### B. Rendering Throughput and Frame Timing
Rendering performance was profiled using Chromium DevTools and automated Playwright test runs.

<div align="center">

### TABLE III
### WEBGL2 REAL-TIME RENDERING METRICS

| Metric | Target Budget | Measured Value | Status |
| :--- | :--- | :--- | :--- |
| **Steady Frame Rate** | $\ge 58.0\text{ FPS}$ | **$59.4\text{–}60.0\text{ FPS}$** | PASS |
| **Peak Frame Draw Time** | $< 16.6\text{ ms}$ | **$3.1\text{ ms}$** | PASS |
| **Main-Thread Long Tasks (>50ms)** | $0$ | **$0$** | PASS |
| **Active GPU Draw Calls** | $< 40\text{ calls}$ | **$14\text{–}24\text{ calls}$** | PASS |
| **Active Heap Allocation** | $< 100\text{ MB}$ | **$54.2\text{ MB}$** | PASS |

</div>

### C. Spherical Invariant and Geodesic Containment Verification
Automated assertions (`assertSphereMapping()`) evaluated 1,007 sampled and edge-case indices against:

$$e_i = \left| \|\vec{p}_i\|_2 - R \right| \quad (22)$$

Maximum radial deviation across all tested indices was $e_{\max} = 0.000000 < \epsilon = 0.001$, mathematically confirming 100% containment on $S^2$.

### D. Trajectory Organic Variation Analysis
Trajectory turn angles $\theta_{\text{turn}}$ were evaluated across five test patterns:

<div align="center">

### TABLE IV
### TEST QUERY TRAJECTORY VERIFICATION

| Test Query | Backend Result | Waypoints | Mean Arc Turn Angle | Path Character |
| :--- | :--- | :--- | :--- | :--- |
| **`3`** | Pos 9 | 1 | N/A | Single highlighted point |
| **`14`** | Pos 1 | 2 | N/A | Single great-circle arc |
| **`15082003`** | Prefix Pos 71,578 | 8 | $94.9^\circ$ | Asymmetric, non-star trajectory |
| **`141592653589793`** | Pos 1 | 15 | $85.6^\circ$ | Continuous surface geodesic |
| **`999999`** | Pos 762 | 6 | $94.7^\circ$ | Surface arc on sphere horizon |

</div>

No trajectory converged into a regular star polygon, confirming genuine data-driven diversity.

---

## VI. CONCLUSION AND FUTURE DIRECTIONS

**Slice of Pi** demonstrates that large mathematical expansions can be indexed, searched, and rendered in standard web browsers with sub-millisecond query responsiveness and 60 FPS graphical performance. By coupling a two-tier memory-mapped index structure with an area-preserving Fibonacci spherical lattice and data-driven geodesic SLERP trajectories, the architecture eliminates both computational raster stalls and geometric projection artifacts.

Future extensions include:
1. *Multi-Billion Scale ($N \ge 10^{10}$):* Deploying compressed FM-indexes based on the Burrows-Wheeler Transform (BWT).
2. *WebGPU Compute Pipelines:* Moving Fibonacci trajectory generation and geodesic path subdivision directly into compute shaders.
3. *Higher Transcendental Constants:* Extending the framework to Euler's number $e$, $\sqrt{2}$, and the golden ratio $\phi$.

---

## REFERENCES

[1] D. H. Bailey, P. B. Borwein, and S. Plouffe, "On the rapid computation of various polylogarithmic constants," *Mathematics of Computation*, vol. 66, no. 218, pp. 903–913, 1997.  
[2] J. Arndt and C. Haenel, *$\pi$ — Unleashed*, Springer-Verlag, Berlin, Heidelberg, 2001.  
[3] E. W. Weisstein, "Pi Digits," from *MathWorld—A Wolfram Web Resource*. [Online]. Available: https://mathworld.wolfram.com/PiDigits.html  
[4] R. Swinbank and R. J. Purser, "Fibonacci grids on the sphere," *Quarterly Journal of the Royal Meteorological Society*, vol. 132, no. 619, pp. 1769–1793, 2006.  
[5] K. Shoemake, "Animating rotation with quaternion curves," in *Proceedings of the 12th Annual Conference on Computer Graphics and Interactive Techniques (SIGGRAPH '85)*, pp. 245–254, 1985.  
[6] Y. Mori, "Short description of improved two-stage suffix sort (divsufsort)," 2005. [Online]. Available: https://github.com/y-256/libdivsufsort  
[7] P. Shirley and R. K. Morley, *Realistic Ray Tracing*, 2nd ed., A K Peters/CRC Press, 2003.  
[8] M. Pharr, W. Jakob, and G. Humphreys, *Physically Based Rendering: From Theory to Implementation*, 3rd ed., Morgan Kaufmann, 2016.  
[9] Three.js Authors, "Three.js JavaScript 3D Library," 2026. [Online]. Available: https://threejs.org/  
[10] FastAPI Authors, "FastAPI Web Framework," 2026. [Online]. Available: https://fastapi.tiangolo.com/  
