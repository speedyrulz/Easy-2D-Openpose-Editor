import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Keypoint, Connection } from '../types';
import { CONNECTIONS, LIMB_PAIRS } from '../constants';
import { Lock, Unlock, Eye, EyeOff, Link as LinkIcon, Unlink } from 'lucide-react';

interface EditorProps {
  width: number;
  height: number;
  backgroundImage: string | null;
  keypoints: Keypoint[];
  onKeypointMove: (id: number, x: number, y: number) => void;
  onDragStart?: () => void;
  scale: number;
  constraints: Record<string, number>;
  isReadOnly?: boolean;
  onToggleLock: (id: number) => void;
  onToggleVisibility: (id: number) => void;
  bgOpacity?: number;
  onSkeletonDrag: (dx: number, dy: number) => void;
  editorMode: 'pose' | 'background';
  bgTransform: { x: number; y: number; scale: number };
  onBgTransformChange: (newTransform: { x: number; y: number; scale: number }) => void;
  onToggleConstraint: (p1: number, p2: number) => void;
  limbThickness: number;
  snapToEdges?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  width,
  height,
  backgroundImage,
  keypoints,
  onKeypointMove,
  onDragStart,
  scale,
  constraints,
  isReadOnly = false,
  onToggleLock,
  onToggleVisibility,
  bgOpacity = 0.5,
  onSkeletonDrag,
  editorMode,
  bgTransform,
  onBgTransformChange,
  onToggleConstraint,
  limbThickness,
  snapToEdges = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number, y: number } | null>(null);
  const [shakingId, setShakingId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: number } | null>(null);
  
  // Dragging state
  const [isDraggingSkeleton, setIsDraggingSkeleton] = useState(false);
  const [isDraggingBg, setIsDraggingBg] = useState(false);
  const [lastDragPos, setLastDragPos] = useState<{x: number, y: number} | null>(null);

  const getMousePosition = (evt: React.MouseEvent | MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    return {
      x: (evt.clientX - CTM.e) / CTM.a,
      y: (evt.clientY - CTM.f) / CTM.d
    };
  };

  const handleMouseDown = (id: number, e: React.MouseEvent) => {
    if (editorMode === 'background') return; // Ignore joint clicks in bg mode
    if (isReadOnly) return;
    if (e.button !== 0) return; // Only left click for drag
    e.preventDefault();
    e.stopPropagation();

    const kp = keypoints.find(k => k.id === id);
    if (!kp) return;
    
    if (kp.locked) {
      setShakingId(id);
      setTimeout(() => setShakingId(null), 400);
      return;
    }

    if (onDragStart) {
      onDragStart();
    }
    setDraggingId(id);
    setDragStartPos({ x: kp.x, y: kp.y });
  };

  const handleLimbMouseDown = (e: React.MouseEvent) => {
    if (editorMode === 'background') return;
    if (isReadOnly) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (onDragStart) onDragStart();

    const pos = getMousePosition(e);
    setIsDraggingSkeleton(true);
    setLastDragPos(pos);
  };

  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (editorMode !== 'background') return;
    if (e.button !== 0) return;
    e.preventDefault();
    
    // We use screen coordinates for background dragging to be smoother/independent of SVG scale
    setIsDraggingBg(true);
    setLastDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = (id: number, e: React.MouseEvent) => {
    if (editorMode === 'background') return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, id });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingId !== null) {
      const pos = getMousePosition(e);
      // Constrain to bounds
      const clampedX = Math.max(0, Math.min(width, pos.x));
      const clampedY = Math.max(0, Math.min(height, pos.y));
      onKeypointMove(draggingId, clampedX, clampedY);
    } else if (isDraggingSkeleton && lastDragPos) {
       const pos = getMousePosition(e);
       const dx = pos.x - lastDragPos.x;
       const dy = pos.y - lastDragPos.y;
       onSkeletonDrag(dx, dy);
       setLastDragPos(pos);
    } else if (isDraggingBg && lastDragPos) {
      // Calculate delta
      const dx = (e.clientX - lastDragPos.x) / scale;
      const dy = (e.clientY - lastDragPos.y) / scale;
      
      let nextX = bgTransform.x + dx;
      let nextY = bgTransform.y + dy;

      if (snapToEdges) {
         const threshold = 15; // Snap threshold in logical pixels
         const s = bgTransform.scale;
         const w = width;
         const h = height;

         // Helper to snap a coordinate value
         const snapAxis = (currentVal: number, dimension: number) => {
            let bestVal = currentVal;
            let bestDist = threshold;

            // Candidates
            // 1. Center aligned (0)
            if (Math.abs(currentVal) < bestDist) {
                bestDist = Math.abs(currentVal);
                bestVal = 0;
            }
            // 2. Left/Top edge aligned (Visual left at 0)
            // Left edge position: w/2 + x - (w*s)/2. Target: 0.
            // x = -(w/2) + (w*s)/2
            const targetLeft = -(dimension / 2) + (dimension * s) / 2;
            if (Math.abs(currentVal - targetLeft) < bestDist) {
                bestDist = Math.abs(currentVal - targetLeft);
                bestVal = targetLeft;
            }
            // 3. Right/Bottom edge aligned (Visual right at w)
            // Right edge position: w/2 + x + (w*s)/2. Target: w.
            // x = w - (w/2) - (w*s)/2 = w/2 - (w*s)/2
            const targetRight = (dimension / 2) - (dimension * s) / 2;
            if (Math.abs(currentVal - targetRight) < bestDist) {
                bestDist = Math.abs(currentVal - targetRight);
                bestVal = targetRight;
            }

            return bestVal;
         };

         nextX = snapAxis(nextX, w);
         nextY = snapAxis(nextY, h);
      }
      
      onBgTransformChange({
        ...bgTransform,
        x: nextX,
        y: nextY
      });
      setLastDragPos({ x: e.clientX, y: e.clientY });
    }
  }, [draggingId, isDraggingSkeleton, isDraggingBg, lastDragPos, width, height, onKeypointMove, onSkeletonDrag, bgTransform, onBgTransformChange, scale, snapToEdges]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setDragStartPos(null);
    setIsDraggingSkeleton(false);
    setIsDraggingBg(false);
    setLastDragPos(null);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (editorMode === 'background') {
      e.preventDefault();
      e.stopPropagation();
      const zoomSensitivity = 0.001;
      const newScale = Math.max(0.1, Math.min(5, bgTransform.scale - e.deltaY * zoomSensitivity));
      onBgTransformChange({
        ...bgTransform,
        scale: newScale
      });
    }
  }, [editorMode, bgTransform, onBgTransformChange]);

  useEffect(() => {
    if (draggingId !== null || isDraggingSkeleton || isDraggingBg) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, isDraggingSkeleton, isDraggingBg, handleMouseMove, handleMouseUp]);

  // Attach wheel listener to SVG container
  useEffect(() => {
    const el = svgRef.current?.parentElement; // The div container
    if (el) {
       el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Close context menu on outside interaction
  useEffect(() => {
    const closeMenu = () => {
      if (contextMenu) setContextMenu(null);
    };
    if (contextMenu) {
      window.addEventListener('click', closeMenu);
      window.addEventListener('contextmenu', closeMenu);
      window.addEventListener('scroll', closeMenu, true);
      window.addEventListener('resize', closeMenu);
    }
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [contextMenu]);

  // Find the currently dragged keypoint for visualization
  const draggedKeypoint = draggingId !== null ? keypoints.find(k => k.id === draggingId) : null;

  const cursorStyle = (() => {
      if (isDraggingBg) return 'grabbing';
      if (editorMode === 'background') return 'grab';
      if (draggingId !== null) return 'grabbing';
      if (isDraggingSkeleton) return 'grabbing';
      if (isReadOnly) return 'default';
      return 'default';
  })();

  return (
    <div 
      className="relative shadow-2xl bg-black border border-gray-800 overflow-hidden select-none"
      style={{ 
        width: width * scale, 
        height: height * scale,
        cursor: cursorStyle
      }}
      onMouseDown={handleBgMouseDown} // Container handles bg drag start
    >
      <style>{`
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        .shake-effect {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      {/* Background Layer */}
      {backgroundImage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img 
            src={backgroundImage} 
            alt="Reference" 
            className="w-full h-full object-contain"
            style={{ 
              opacity: bgOpacity,
              transform: `translate(${bgTransform.x}px, ${bgTransform.y}px) scale(${bgTransform.scale})`,
              transformOrigin: 'center',
              transition: isDraggingBg ? 'none' : 'transform 0.1s ease-out'
            }}
          />
        </div>
      )}
      
      {/* Interaction Layer (SVG) */}
      <svg 
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: editorMode === 'background' ? 'none' : 'auto' }}
      >
        {/* Drag Path Indicator - Rendered below limbs/joints */}
        {draggedKeypoint && dragStartPos && (
          <g className="pointer-events-none">
            {/* Start position ghost */}
            <circle
              cx={dragStartPos.x}
              cy={dragStartPos.y}
              r={4}
              fill="none"
              stroke="#fbbf24" // Amber-400
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.6}
            />
            {/* Path line */}
            <line
              x1={dragStartPos.x}
              y1={dragStartPos.y}
              x2={draggedKeypoint.x}
              y2={draggedKeypoint.y}
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </g>
        )}

        {/* Limbs (Connections) */}
        {CONNECTIONS.map((conn, idx) => {
          const kp1 = keypoints[conn.p1];
          const kp2 = keypoints[conn.p2];
          
          if (!kp1.visible || !kp2.visible) return null;

          const key = [conn.p1, conn.p2].sort((a, b) => a - b).join('-');
          const isLocked = !!constraints[key];

          return (
            <g 
                key={`conn-${idx}`} 
                onMouseDown={handleLimbMouseDown}
                className={`${isReadOnly ? '' : 'cursor-move'} hover:opacity-90`}
            >
               {/* Invisible wide stroke for easier grabbing, scales with limb thickness */}
               <line
                x1={kp1.x}
                y1={kp1.y}
                x2={kp2.x}
                y2={kp2.y}
                stroke="transparent"
                strokeWidth={Math.max(20, limbThickness + 10)}
                strokeLinecap="round"
              />
               <line
                x1={kp1.x}
                y1={kp1.y}
                x2={kp2.x}
                y2={kp2.y}
                stroke={conn.color}
                strokeWidth={limbThickness}
                strokeLinecap="round"
                className="opacity-80 transition-opacity"
              />
              {isLocked && (
                 <>
                   <line
                      x1={kp1.x}
                      y1={kp1.y}
                      x2={kp2.x}
                      y2={kp2.y}
                      stroke="white"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      className="opacity-60 pointer-events-none"
                   />
                   <circle 
                      cx={(kp1.x + kp2.x) / 2} 
                      cy={(kp1.y + kp2.y) / 2} 
                      r={4} 
                      fill="white" 
                      className="pointer-events-none"
                   />
                 </>
              )}
            </g>
          );
        })}

        {/* Joints (Keypoints) */}
        {keypoints.map((kp) => (
          kp.visible && (
            <g 
              key={kp.id} 
              onMouseDown={(e) => handleMouseDown(kp.id, e)}
              onContextMenu={(e) => handleContextMenu(kp.id, e)}
              className={`${isReadOnly ? 'cursor-default' : kp.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} hover:filter hover:brightness-125 transition-all`}
              style={{ opacity: isReadOnly ? 0.9 : 1 }}
            >
              {/* Larger transparent circle for easier grabbing */}
              <circle cx={kp.x} cy={kp.y} r={15} fill="transparent" />
              
              {/* Visual Feedback for Locked/Shaking */}
              {shakingId === kp.id && (
                <circle 
                  cx={kp.x} 
                  cy={kp.y} 
                  r={12} 
                  fill="none" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  className="animate-ping"
                  style={{ animationDuration: '0.4s' }}
                />
              )}

              {/* Visible joint */}
              <circle 
                cx={kp.x} 
                cy={kp.y} 
                r={6} 
                fill={kp.color}
                stroke={shakingId === kp.id ? '#ef4444' : (kp.locked ? '#ef4444' : 'white')} 
                strokeWidth={shakingId === kp.id ? 2.5 : (kp.locked ? 2.5 : 1.5)}
                className={shakingId === kp.id ? "shake-effect" : ""}
              />
              
              {/* Lock Icon Overlay */}
              {kp.locked && (
                <g className="pointer-events-none" style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.5))' }}>
                    <circle cx={kp.x + 8} cy={kp.y - 8} r={7} fill="#18181b" stroke="#ef4444" strokeWidth="1" />
                    <Lock 
                        x={kp.x + 8 - 4.5} 
                        y={kp.y - 8 - 4.5} 
                        size={9} 
                        color="#ef4444" 
                        strokeWidth={2.5}
                    />
                </g>
              )}
            </g>
          )
        ))}
      </svg>

      {/* Context Menu */}
      {contextMenu && (() => {
          const kp = keypoints.find(k => k.id === contextMenu.id);
          if (!kp) return null;
          
          // Find connected limbs for this joint
          const connectedLimbs = LIMB_PAIRS.filter(pair => pair.includes(kp.id));

          return (
             <div 
               className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-60 overflow-hidden"
               style={{ left: contextMenu.x, top: contextMenu.y }}
             >
                {/* Header: Main Joint Actions */}
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-800/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                     <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: kp.color }} />
                     <span className="font-semibold text-zinc-200 text-sm truncate">{kp.name}</span>
                     <span className="text-[10px] text-zinc-600 shrink-0">#{kp.id}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                     <button 
                       onClick={(e) => { 
                           // Global click handler will close menu
                           onToggleLock(kp.id); 
                       }}
                       className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${kp.locked ? 'text-red-500 bg-red-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                       title={kp.locked ? "Unlock" : "Lock"}
                     >
                       {kp.locked ? <Lock size={14} /> : <Unlock size={14} />}
                     </button>
                     <button 
                       onClick={(e) => { 
                           onToggleVisibility(kp.id); 
                       }}
                       className={`p-1.5 rounded hover:bg-zinc-700 transition-colors ${!kp.visible ? 'text-zinc-500 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200'}`}
                       title={kp.visible ? "Hide" : "Show"}
                     >
                       {kp.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                     </button>
                  </div>
                </div>

                {/* Connections List */}
                {connectedLimbs.length > 0 && (
                  <div className="py-1">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-zinc-600 tracking-wider">
                       Connected Limbs
                    </div>
                    
                    {connectedLimbs.map((pair, idx) => {
                       const otherId = pair[0] === kp.id ? pair[1] : pair[0];
                       const otherKp = keypoints.find(k => k.id === otherId);
                       if (!otherKp) return null;
                       
                       const key = [...pair].sort((a, b) => a - b).join('-');
                       const isDistLocked = !!constraints[key];

                       return (
                         <div key={idx} className="group flex items-center justify-between px-3 py-1 hover:bg-zinc-800 transition-colors">
                            {/* Toggle Distance Constraint (Left Side) */}
                            <button 
                                onClick={() => onToggleConstraint(pair[0], pair[1])}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left py-1"
                                title={`Toggle distance lock to ${otherKp.name}`}
                            >
                                {isDistLocked ? (
                                    <LinkIcon size={14} className="text-blue-500 shrink-0" />
                                ) : (
                                    <LinkIcon size={14} className="text-zinc-600 group-hover:text-blue-400 shrink-0" />
                                )}
                                <span className="text-sm text-zinc-300 truncate group-hover:text-zinc-100">
                                   {otherKp.name}
                                </span>
                            </button>

                            {/* Toggle Other Joint Properties (Right Side - Only visible on hover or if state is active) */}
                            <div className={`flex items-center gap-1 ${otherKp.locked || !otherKp.visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                <button
                                    onClick={(e) => { 
                                        e.stopPropagation(); // Don't trigger row click
                                        onToggleLock(otherId);
                                    }}
                                    className={`p-1 rounded hover:bg-zinc-700 ${otherKp.locked ? 'text-red-500' : 'text-zinc-600 hover:text-zinc-400'}`}
                                    title={`Lock ${otherKp.name}`}
                                >
                                    {otherKp.locked ? <Lock size={12}/> : <Unlock size={12}/>}
                                </button>
                                <button
                                    onClick={(e) => { 
                                        e.stopPropagation(); // Don't trigger row click
                                        onToggleVisibility(otherId);
                                    }}
                                    className={`p-1 rounded hover:bg-zinc-700 ${!otherKp.visible ? 'text-zinc-500' : 'text-zinc-600 hover:text-zinc-400'}`}
                                    title={`Hide ${otherKp.name}`}
                                >
                                    {otherKp.visible ? <Eye size={12}/> : <EyeOff size={12}/>}
                                </button>
                            </div>
                         </div>
                       );
                    })}
                  </div>
                )}
             </div>
          );
       })()}
    </div>
  );
};