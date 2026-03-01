import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface HotspotLink {
  targetId: string;
  phi: number;
  theta: number;
}

interface Hotspot {
  id: string;
  name: string;
  url: string;
  x: number;
  y: number;
  isPlaced: boolean;
  links?: HotspotLink[];
}

interface Viewer360Props {
  url: string;
  onClose: () => void;
  hotspots: Hotspot[];
  currentId: string;
  onNavigate: (h: Hotspot) => void;
  onUpdateHotspot: (id: string, data: Partial<Hotspot>) => void;
  onAddLink: (sourceId: string, link: HotspotLink) => void;
  onUpdateLink: (sourceId: string, targetId: string, data: Partial<HotspotLink>) => void;
  lastDrop?: { id: string; x: number; y: number } | null;
}

const Viewer360: React.FC<Viewer360Props> = ({ url, onClose, hotspots, currentId, onNavigate, onUpdateHotspot, onAddLink, onUpdateLink, lastDrop }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingHotspot, setIsDraggingHotspot] = useState<string | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Xử lý khi có điểm mới được thả vào từ sidebar
  useEffect(() => {
    if (lastDrop && cameraRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((lastDrop.x - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((lastDrop.y - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      const dir = raycaster.ray.direction.clone().normalize();
      const pos = dir.multiplyScalar(400);
      
      const r = pos.length();
      const newLat = 90 - THREE.MathUtils.radToDeg(Math.acos(pos.y / r));
      const newLon = THREE.MathUtils.radToDeg(Math.atan2(pos.z, pos.x));
      
      // Thêm link từ điểm hiện tại tới điểm vừa thả
      onAddLink(currentId, {
        targetId: lastDrop.id,
        phi: newLat,
        theta: newLon
      });
    }
  }, [lastDrop]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(url);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    camera.position.set(0, 0, 0.1);

    // Hotspots Group
    const hotspotsGroup = new THREE.Group();
    scene.add(hotspotsGroup);

    const createHotspotMesh = (h: Hotspot, phi_deg: number, theta_deg: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear
        ctx.clearRect(0, 0, 256, 256);

        // Text Label (Above)
        const text = h.name.slice(0, 20);
        ctx.font = 'bold 28px Inter';
        const textWidth = ctx.measureText(text).width;
        const padding = 30;
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(128 - (textWidth + padding) / 2, 10, textWidth + padding, 50, 25);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 45);

        // Shadow for floating effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 10;

        // Pin (Orange-Red, Transparent 70%)
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#f97316'; // Orange-Red
        ctx.beginPath();
        ctx.arc(128, 138, 70, 0, Math.PI * 2); // Increased radius to 70
        ctx.fill();
        
        // Reset shadow for border and dot
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Border
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Center Dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(128, 138, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      const hotspotTexture = new THREE.CanvasTexture(canvas);
      const hotspotMaterial = new THREE.SpriteMaterial({ 
        map: hotspotTexture,
        transparent: true,
        depthTest: false
      });
      const sprite = new THREE.Sprite(hotspotMaterial);
      sprite.scale.set(75, 75, 1); // Increased from 50 to 75 (150%)
      sprite.userData = { id: h.id, hotspot: h };

      // Position
      const phi = THREE.MathUtils.degToRad(90 - (phi_deg || 0));
      const theta = THREE.MathUtils.degToRad(theta_deg || 0);
      sprite.position.set(
        400 * Math.sin(phi) * Math.cos(theta),
        400 * Math.cos(phi),
        400 * Math.sin(phi) * Math.sin(theta)
      );

      return sprite;
    };

    // Add linked hotspots to the scene
    const currentHotspot = hotspots.find(h => h.id === currentId);
    if (currentHotspot && currentHotspot.links) {
      currentHotspot.links.forEach(link => {
        const targetHotspot = hotspots.find(h => h.id === link.targetId);
        if (targetHotspot) {
          hotspotsGroup.add(createHotspotMesh(targetHotspot, link.phi, link.theta));
        }
      });
    }

    let isUserInteracting = false;
    let onPointerDownPointerX = 0;
    let onPointerDownPointerY = 0;
    let onPointerDownLon = 0;
    let onPointerDownLat = 0;
    let lon = 0;
    let lat = 0;
    let phi = 0;
    let theta = 0;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(hotspotsGroup.children);
      if (intersects.length > 0) {
        const clickedSprite = intersects[0].object as THREE.Sprite;
        if (event.altKey) {
          setIsDraggingHotspot(clickedSprite.userData.id);
        } else {
          onNavigate(clickedSprite.userData.hotspot);
        }
        return;
      }

      isUserInteracting = true;
      onPointerDownPointerX = event.clientX;
      onPointerDownPointerY = event.clientY;
      onPointerDownLon = lon;
      onPointerDownLat = lat;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isDraggingHotspot) {
        const rect = containerRef.current!.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        const dir = raycaster.ray.direction.clone().normalize();
        const pos = dir.multiplyScalar(400);
        
        const sprite = hotspotsGroup.children.find(c => c.userData.id === isDraggingHotspot) as THREE.Sprite;
        if (sprite) {
          sprite.position.copy(pos);
          const r = pos.length();
          const newLat = 90 - THREE.MathUtils.radToDeg(Math.acos(pos.y / r));
          const newLon = THREE.MathUtils.radToDeg(Math.atan2(pos.z, pos.x));
          onUpdateLink(currentId, isDraggingHotspot, { phi: newLat, theta: newLon });
        }
        return;
      }

      if (isUserInteracting) {
        lon = (onPointerDownPointerX - event.clientX) * 0.1 + onPointerDownLon;
        lat = (event.clientY - onPointerDownPointerY) * 0.1 + onPointerDownLat;
      }
    };

    const onPointerUp = () => {
      isUserInteracting = false;
      setIsDraggingHotspot(null);
    };

    const onWheel = (event: WheelEvent) => {
      const fov = camera.fov + event.deltaY * 0.05;
      camera.fov = THREE.MathUtils.clamp(fov, 10, 75);
      camera.updateProjectionMatrix();
    };

    const container = containerRef.current;
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel);

    const animate = () => {
      requestAnimationFrame(animate);

      lat = Math.max(-85, Math.min(85, lat));
      phi = THREE.MathUtils.degToRad(90 - lat);
      theta = THREE.MathUtils.degToRad(lon);

      const x = 500 * Math.sin(phi) * Math.cos(theta);
      const y = 500 * Math.cos(phi);
      const z = 500 * Math.sin(phi) * Math.sin(theta);

      camera.lookAt(x, y, z);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('wheel', onWheel);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url, hotspots, currentId, isDraggingHotspot]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm viewer-360-container">
      <div className="relative w-[95vw] h-[90vh] bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        <div ref={containerRef} className="w-full h-full cursor-move" />
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all hover:scale-110 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/50 backdrop-blur-xl rounded-2xl text-white text-[10px] font-bold uppercase tracking-wider flex gap-6 pointer-events-none border border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <span>Kéo để xoay</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Click điểm để di chuyển</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Kéo thả từ danh sách để thêm điểm</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Alt + Kéo để chỉnh vị trí</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Viewer360;
