/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Upload, X, Plus, Image as ImageIcon, Trash2, Edit3, Download, FileJson } from 'lucide-react';
import Viewer360 from './components/Viewer360';

interface HotspotLink {
  targetId: string;
  phi: number;
  theta: number;
}

interface Hotspot {
  id: string;
  name: string;
  url: string;
  x: number; // Tọa độ % trên map
  y: number; // Tọa độ % trên map
  isPlaced: boolean;
  links?: HotspotLink[];
}

export default function App() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [sitePlan, setSitePlan] = useState<string | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState<string | null>(null);
  const [lastDrop, setLastDrop] = useState<{ id: string; x: number; y: number } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Export data to JSON
  const exportData = () => {
    const data = {
      hotspots,
      sitePlan,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `site-mapper-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import data from JSON
  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.hotspots) setHotspots(json.hotspots);
        if (json.sitePlan) setSitePlan(json.sitePlan);
      } catch (err) {
        alert('Lỗi khi đọc file JSON. Vui lòng kiểm tra lại định dạng.');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Xử lý upload mặt bằng
  const handleSitePlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setSitePlan(base64);
      } catch (err) {
        console.error("Error converting site plan to base64", err);
      }
    }
  };

  // Xử lý upload ảnh 360
  const handle360Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newHotspots: Hotspot[] = [];
      for (const file of Array.from(files) as File[]) {
        try {
          const base64 = await fileToBase64(file);
          newHotspots.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0] || 'Điểm mới',
            url: base64,
            x: 50,
            y: 50,
            isPlaced: false,
          });
        } catch (err) {
          console.error("Error converting 360 image to base64", err);
        }
      }
      setHotspots((prev) => [...prev, ...newHotspots]);
    }
  };

  // Cập nhật vị trí hotspot khi kéo thả từ sidebar hoặc trên map
  const handleDragEndFromSidebar = (id: string, info: any) => {
    // Trường hợp thả vào mặt bằng 2D
    if (containerRef.current && !selectedHotspot) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((info.point.x - rect.left) / rect.width) * 100;
      const y = ((info.point.y - rect.top) / rect.height) * 100;

      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        setHotspots((prev) =>
          prev.map((h) => (h.id === id ? { ...h, x, y, isPlaced: true } : h))
        );
      }
    }
    
    // Trường hợp thả vào viewer 360 (nếu đang mở)
    const viewerElement = document.querySelector('.viewer-360-container');
    if (viewerElement && selectedHotspot) {
      const rect = viewerElement.getBoundingClientRect();
      if (info.point.x >= rect.left && info.point.x <= rect.right && 
          info.point.y >= rect.top && info.point.y <= rect.bottom) {
        // Gửi thông tin drop vào viewer
        setLastDrop({ id, x: info.point.x, y: info.point.y });
        // Reset sau một khoảng thời gian ngắn để có thể drop lại cùng 1 id
        setTimeout(() => setLastDrop(null), 100);
      }
    }

    setIsDragging(false);
  };

  const handleDragEndOnMap = (id: string, info: any) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((info.point.x - rect.left) / rect.width) * 100;
    const y = ((info.point.y - rect.top) / rect.height) * 100;

    setHotspots((prev) =>
      prev.map((h) => (h.id === id ? { ...h, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : h))
    );
    setIsDragging(false);
  };

  const deleteHotspot = (id: string) => {
    setHotspots((prev) => prev
      .filter((h) => h.id !== id)
      .map((h) => ({
        ...h,
        links: h.links ? h.links.filter(l => l.targetId !== id) : undefined
      }))
    );
  };

  const updateHotspotName = (id: string, name: string) => {
    setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, name } : h)));
    setEditingHotspot(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-[#1A1A1A]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-black/5">
            <img 
              src="https://binhanshipping.vn/wp-content/uploads/2024/07/cropped-logo-binh-an.webp" 
              alt="Binh An Shipping Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">360° Site Mapper</h1>
            <p className="text-xs text-black/40 font-medium uppercase tracking-wider">Bình An Shipping Tool</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 pr-4 border-r border-black/10">
            <button 
              onClick={exportData}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold hover:bg-emerald-100 transition-all"
              title="Xuất dữ liệu JSON"
            >
              <Download size={14} />
              <span>Export</span>
            </button>
            <label className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-full text-xs font-bold cursor-pointer hover:bg-blue-100 transition-all" title="Nhập dữ liệu JSON">
              <FileJson size={14} />
              <span>Import</span>
              <input type="file" accept=".json" className="hidden" onChange={importData} />
            </label>
          </div>

          <label className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-sm font-medium cursor-pointer hover:bg-black/80 transition-all shadow-sm">
            <Upload size={16} />
            <span>Nạp Ảnh 360°</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handle360Upload} />
          </label>
          
          {!sitePlan && (
            <label className="flex items-center gap-2 px-4 py-2 bg-white border border-black/10 rounded-full text-sm font-medium cursor-pointer hover:bg-black/5 transition-all">
              <ImageIcon size={16} />
              <span>Tải Mặt Bằng</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleSitePlanUpload} />
            </label>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative h-screen w-screen overflow-hidden bg-[#F0F2F5]">
        {/* Floating Sidebar - List of points */}
        <aside className="absolute top-24 left-6 z-[60] w-7 md:w-20 lg:w-36 max-h-[calc(100vh-8rem)] bg-white/90 backdrop-blur-xl rounded-3xl border border-black/5 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 hover:w-72 group/sidebar">
          <div className="p-4 border-b border-black/5 flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-black/60 uppercase tracking-widest hidden md:block group-hover/sidebar:block">Điểm 360°</h2>
            <span className="px-2 py-0.5 bg-black/5 rounded-full text-[10px] font-bold mx-auto md:mx-0">{hotspots.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {hotspots.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                <Plus size={24} strokeWidth={1} className="mb-2" />
                <p className="text-[8px] font-medium uppercase tracking-tighter hidden md:block group-hover/sidebar:block">Trống</p>
              </div>
            ) : (
              hotspots.map((h) => (
                <motion.div
                  key={h.id}
                  drag
                  dragSnapToOrigin
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={(_, info) => handleDragEndFromSidebar(h.id, info)}
                  whileDrag={{ scale: 1.02, zIndex: 50 }}
                  className={`group p-2 rounded-xl transition-all cursor-grab active:cursor-grabbing border flex flex-col items-center md:items-start group-hover/sidebar:items-start select-none ${
                    h.isPlaced 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900' 
                      : 'bg-white border-black/5 hover:border-black/20 shadow-sm'
                  }`}
                  onClick={() => h.isPlaced && setSelectedHotspot(h)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-black/10 border border-black/5 relative pointer-events-none">
                      <img 
                        src={h.url} 
                        className="w-full h-full object-cover" 
                        alt="" 
                        draggable="false"
                        referrerPolicy="no-referrer" 
                      />
                      {h.isPlaced && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 border border-white" />}
                    </div>
                    <div className="flex-1 min-w-0 hidden md:block group-hover/sidebar:block text-left">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold truncate">{h.name}</p>
                        <div className="flex gap-1 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingHotspot(h.id); }}
                            className="p-1 hover:bg-black/5 rounded text-black/40 hover:text-black"
                          >
                            <Edit3 size={10} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteHotspot(h.id); }}
                            className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[8px] opacity-40 font-mono">#{h.id.slice(0, 4)}</p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </aside>

        {/* Full Screen Site Plan Area */}
        <section className="h-full w-full relative flex items-center justify-center overflow-hidden">
          {!sitePlan ? (
            <div className="text-center p-12 bg-white rounded-[40px] shadow-2xl border border-black/5 max-w-sm mx-auto">
              <div className="w-24 h-24 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-8">
                <ImageIcon size={40} className="text-black/20" />
              </div>
              <h3 className="text-2xl font-bold mb-3 tracking-tight">Bắt đầu dự án</h3>
              <p className="text-black/40 mb-8 text-sm leading-relaxed">Tải lên hình ảnh mặt bằng để bắt đầu định vị các điểm 360°.</p>
              <label className="inline-flex items-center gap-3 px-8 py-4 bg-black text-white rounded-2xl font-bold cursor-pointer hover:scale-105 transition-all shadow-xl shadow-black/20 active:scale-95">
                <Upload size={20} />
                <span>Chọn file mặt bằng</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleSitePlanUpload} />
              </label>
            </div>
          ) : (
            <div 
              ref={containerRef}
              className="relative w-full h-full flex items-center justify-center overflow-hidden"
            >
              <div className="relative inline-block max-w-[95%] max-h-[95%]">
                <motion.img 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  src={sitePlan} 
                  alt="Site Plan" 
                  draggable="false"
                  className="max-w-full max-h-[90vh] object-contain select-none pointer-events-none rounded-xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)]"
                  referrerPolicy="no-referrer"
                />
                
                {/* Hotspots Layer */}
                <div className="absolute inset-0">
                  {hotspots.filter(h => h.isPlaced).map((h) => (
                    <motion.div
                      key={h.id}
                      drag
                      dragMomentum={false}
                      onDragStart={() => setIsDragging(true)}
                      onDragEnd={(_, info) => handleDragEndOnMap(h.id, info)}
                      className="absolute z-10 cursor-grab active:cursor-grabbing"
                      style={{ 
                        left: `${h.x}%`, 
                        top: `${h.y}%`,
                        x: '-50%',
                        y: '-50%'
                      }}
                    >
                      <div className="relative group/pin flex flex-col items-center">
                        {/* Label - Always visible */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[8px] font-bold uppercase tracking-wider rounded-md whitespace-nowrap shadow-sm border border-white/10 pointer-events-none">
                          {h.name}
                        </div>
                        
                        {/* Pin Icon - Smaller, Red, Transparent */}
                        <div 
                          onClick={() => !isDragging && setSelectedHotspot(h)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                            selectedHotspot?.id === h.id 
                              ? 'bg-red-600/60 scale-110 shadow-[0_0_10px_rgba(220,38,38,0.6)]' 
                              : 'bg-red-600/30 hover:bg-red-600/50 hover:scale-110 shadow-lg'
                          } border-2 border-white`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              
              {/* Floating Controls */}
              <div className="absolute bottom-8 right-8 flex gap-3">
                <button 
                  onClick={() => setSitePlan(null)}
                  className="p-4 bg-white/80 backdrop-blur-md border border-black/5 rounded-2xl shadow-2xl hover:bg-red-50 text-red-500 transition-all hover:scale-110 active:scale-95"
                  title="Xóa mặt bằng"
                >
                  <Trash2 size={24} />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {selectedHotspot && (
          <Viewer360 
            url={selectedHotspot.url} 
            onClose={() => setSelectedHotspot(null)} 
            hotspots={hotspots}
            currentId={selectedHotspot.id}
            onNavigate={(h) => setSelectedHotspot(h)}
            onUpdateHotspot={(id, data) => {
              setHotspots(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
            }}
            onAddLink={(sourceId, link) => {
              setHotspots(prev => prev.map(h => {
                if (h.id === sourceId) {
                  const links = h.links || [];
                  // Remove existing link to same target if any
                  const filteredLinks = links.filter(l => l.targetId !== link.targetId);
                  return { ...h, links: [...filteredLinks, link] };
                }
                return h;
              }));
            }}
            onUpdateLink={(sourceId, targetId, data) => {
              setHotspots(prev => prev.map(h => {
                if (h.id === sourceId && h.links) {
                  return {
                    ...h,
                    links: h.links.map(l => l.targetId === targetId ? { ...l, ...data } : l)
                  };
                }
                return h;
              }));
            }}
            lastDrop={lastDrop}
          />
        )}

        {editingHotspot && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-semibold mb-6">Đổi tên điểm</h3>
              <input 
                autoFocus
                type="text"
                defaultValue={hotspots.find(h => h.id === editingHotspot)?.name}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateHotspotName(editingHotspot, e.currentTarget.value);
                  if (e.key === 'Escape') setEditingHotspot(null);
                }}
                className="w-full px-4 py-3 bg-black/5 rounded-xl border-none focus:ring-2 focus:ring-black mb-6"
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setEditingHotspot(null)}
                  className="flex-1 py-3 font-medium text-black/40 hover:text-black transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={() => {
                    const input = document.querySelector('input') as HTMLInputElement;
                    updateHotspotName(editingHotspot, input.value);
                  }}
                  className="flex-1 py-3 bg-black text-white rounded-xl font-medium hover:bg-black/80 transition-all"
                >
                  Lưu thay đổi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Instructions Overlay */}
      {!sitePlan && hotspots.length > 0 && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-30">
          <div className="bg-black text-white px-6 py-3 rounded-full text-sm font-medium shadow-2xl animate-bounce">
            Tải mặt bằng lên để bắt đầu kéo thả các điểm!
          </div>
        </div>
      )}
    </div>
  );
}
