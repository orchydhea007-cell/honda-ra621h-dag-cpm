# Honda RA621H — DAG & CPM Assembly Scheduler

> **Implementasi DAG + Kahn's Topological Sort + Critical Path Method (CPM) untuk penjadwalan perakitan F1 Honda RA621H**  
> Proyek Struktur Data dan Algoritma · 2025

![F1 Engine Assembly](https://img.shields.io/badge/Honda-RA621H-red?style=for-the-badge)
![Algorithm](https://img.shields.io/badge/Algorithm-DAG%20%2B%20CPM-black?style=for-the-badge)
![Complexity](https://img.shields.io/badge/Complexity-O(V%2BE)-green?style=for-the-badge)
![Components](https://img.shields.io/badge/Components-103%20nodes-blue?style=for-the-badge)

---

## 🏎️ Overview

Proyek ini mengimplementasikan **Directed Acyclic Graph (DAG)** dan **Critical Path Method (CPM)** untuk menyelesaikan masalah penjadwalan perakitan mesin F1 Honda RA621H — mesin yang mengantarkan Max Verstappen meraih **World Drivers' Championship 2021**.

**Masalah:** 103 komponen dengan 216 dependency antar-komponen. Urutan assembly yang salah = komponen dipasang sebelum prasyaratnya selesai = bongkar ulang = buang waktu race weekend.

**Solusi:** DAG merepresentasikan dependency, Kahn's Algorithm menghasilkan urutan valid, CPM mengidentifikasi jalur kritis dan float tiap komponen.

---

## 📊 Dataset

| Metrik | Nilai |
|--------|-------|
| Total Komponen (Nodes) | **103** |
| Dependency Edges | **216** |
| Root Nodes (no deps) | **16** |
| Critical Path Nodes | **52** |
| Non-Critical Nodes | **51** |
| Total Assembly Duration | **1,032 jam** |
| Project Duration (CPM) | **1,485 jam** |
| Subsystems | **19** |

### Subsystems
ICE · Turbocharger · MGU-H · MGU-K · Energy Store · Lubrication · Cooling · Fuel · Electronics · Chassis · Suspension Front/Rear · Aero Front/Rear · Gearbox · Braking · Wheels & Tyres · Cockpit & Safety · Final Assembly

---

## 🧠 Algorithm

### 1. DAG Construction — `O(V + E)`

```
Input:  103 komponen dengan field "Depends On"
Output: Adjacency list + reverse adjacency + in-degree map

Untuk setiap komponen c:
  Untuk setiap dep d dalam c.deps:
    adj[d].add(c)      → d harus selesai sebelum c
    radj[c].add(d)     → predecessor c adalah d
    inDegree[c]++
```

### 2. Kahn's Topological Sort — `O(V + E)`

```
1. Hitung in-degree tiap node
2. Masukkan semua node dengan in-degree = 0 ke queue (root nodes)
3. while queue tidak kosong:
     wave = semua node di queue saat ini (bisa dikerjakan paralel)
     untuk setiap node n di wave:
       tambahkan n ke sorted order
       untuk setiap successor s dari n:
         inDegree[s]--
         if inDegree[s] == 0: masukkan s ke queue
4. Jika |order| < |nodes| → ada siklus (invalid DAG)
```

**Wave = batch node yang bisa dikerjakan paralel.** Setiap wave merepresentasikan kelompok komponen yang bisa dirakit oleh tim berbeda secara bersamaan.

### 3. CPM Forward Pass — `O(V + E)`

```
Untuk setiap node n (dalam urutan topologis):
  ES[n] = max(EF[p] untuk semua predecessor p)  // paling awal bisa mulai
  EF[n] = ES[n] + Duration[n]                   // paling awal selesai

Project Duration = max(EF[n] untuk semua n)
```

### 4. CPM Backward Pass — `O(V + E)`

```
Untuk setiap node n (urutan topologis terbalik):
  LF[n] = min(LS[s] untuk semua successor s)   // paling lambat boleh selesai
  LS[n] = LF[n] - Duration[n]                  // paling lambat boleh mulai
  TF[n] = LS[n] - ES[n]                        // total float (slack)

Critical Path: semua node dengan TF[n] = 0
```

### Total Complexity

| Step | Time | Space |
|------|------|-------|
| Build DAG | O(V+E) | O(V+E) |
| Kahn's Sort | O(V+E) | O(V) |
| CPM Forward | O(V+E) | O(V) |
| CPM Backward | O(V+E) | O(V) |
| Path Extraction | O(V) | O(V) |
| **Total** | **O(V+E)** | **O(V+E)** |

Dengan V=103, E=216 → sangat efisien bahkan untuk dataset skala besar.

---

## 📁 Struktur Folder

```
honda-ra621h-dag-cpm/
│
├── index.html              # Entry point — open this in browser
│
├── css/
│   └── style.css           # F1-themed dark UI design
│
├── js/
│   ├── algorithm.js        # Core: DAG + Kahn + CPM implementation
│   ├── visualizer.js       # Canvas-based DAG renderer (pan/zoom)
│   └── main.js             # UI controller, wires everything together
│
├── data/
│   ├── components.json     # 103 komponen (generated from CSV)
│   ├── components.csv      # Raw component data
│   ├── dependency_edges.csv # 216 dependency edges
│   └── summary_stats.csv   # Dataset statistics
│
└── README.md
```

---

## 🚀 Quick Start

### Option A: Open Directly (Recommended)

```bash
# Clone repo
git clone https://github.com/<your-username>/honda-ra621h-dag-cpm.git
cd honda-ra621h-dag-cpm

# Open in browser (CORS-safe via local server)
npx serve .
# or
python3 -m http.server 8080
# then open http://localhost:8080
```

> ⚠️ Jangan buka `index.html` langsung via `file://` karena fetch() akan diblokir CORS. Gunakan local server.

### Option B: GitHub Pages

Push ke GitHub → Settings → Pages → Deploy from branch `main` → `/root`

---

## 📱 Features

| Tab | Deskripsi |
|-----|-----------|
| **Overview** | Statistik dataset, breakdown durasi per subsystem, penjelasan pipeline |
| **DAG Visualizer** | Canvas interaktif — hover, pan, zoom, 103 nodes, color-coded per subsystem |
| **Topological Sort** | Wave-by-wave Kahn's result, parallelism groups, validity check |
| **Critical Path (CPM)** | Ordered critical path list, float analysis table (ES/EF/LS/LF/TF) |
| **Component Table** | Full sortable/filterable table, duration bars, CPM values |
| **Algorithm** | Explainer teoritis + complexity analysis + referensi jurnal |

---

## 🔬 Technical Notes

### DAG Representation

Adjacency list dipilih karena:
- Space: `O(V + E)` vs `O(V²)` untuk adjacency matrix
- Traversal: `O(deg(v))` per node vs `O(V)` per row
- Sparse graph: E=216 << V²=10609 → adjacency list jauh lebih efisien

### Kahn's vs DFS Topological Sort

| | Kahn's (BFS) | DFS-based |
|---|---|---|
| Cycle detection | Explicit via residual in-degree | Via back-edge detection |
| Parallelism | Natural (wave = parallel batch) | Tidak natural |
| Implementation | Queue-based, intuitive | Recursive, stack-based |
| Complexity | O(V+E) | O(V+E) |

Kahn's dipilih karena secara natural menghasilkan **parallel waves** — sangat relevan untuk assembly scheduling (berapa tim yang bisa bekerja bersamaan).

### Critical Path Interpretation

- **TF = 0**: Komponen on critical path. Delay sekecil apapun = delay keseluruhan proyek.
- **TF > 0**: Ada slack. Bisa diundur maksimal TF jam tanpa mempengaruhi project deadline.
- **Parallel waves**: Komponen di wave yang sama bisa dikerjakan oleh tim berbeda → optimasi resource.

---

## 📚 Referensi

1. **Activity Networks Determine Project Performance** — *Open Access, 2023*  
   Fondasi teoritik CPM, forward/backward pass formulation.

2. **A Multi-Object Genetic Algorithm for Assembly Line Balance Optimization in Garment Flexible Job Shop Scheduling** — *2024*  
   Assembly scheduling dengan dependency constraints, parallelism groups.

3. **DAG-based Task Scheduling for Parallel Processing Systems** — *2023*  
   Kahn's algorithm wave batching, parallel execution analysis.

---

## 👥 Tim

**Proyek Struktur Data dan Algoritma 2025**  
Dataset: Honda RA621H · F1 World Championship 2021

---

## 📄 License

MIT License — see [LICENSE](LICENSE)
