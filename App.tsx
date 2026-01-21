import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { INITIAL_KEYPOINTS, DEFAULT_POSE_COORDS, CONNECTIONS, POSE_HIERARCHY } from './constants';
import { Keypoint } from './types';
import { detectPose } from './services/geminiService';

interface HistoryState {
  keypoints: Keypoint[];
  constraints: Record<string, number>;
}

const App: React.FC = () => {
  const [size, setSize] = useState({ width: 512, height: 512 });
  const [scale, setScale] = useState(1);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgAspectRatio, setBgAspectRatio] = useState<number | null>(null); // New state to track image aspect
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [bgTransform, setBgTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [editorMode, setEditorMode] = useState<'pose' | 'background'>('pose');
  const [lockedJointMode, setLockedJointMode] = useState<'translate' | 'rotate'>('translate');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false); // New state for transform lock
  const [lockCanvas, setLockCanvas] = useState(false);
  const [keepPose, setKeepPose] = useState(true);
  const [limbThickness, setLimbThickness] = useState(8);
  const [snapToEdges, setSnapToEdges] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // History Stacks
  const [history, setHistory] = useState<{ past: HistoryState[], future: HistoryState[] }>({
    past: [],
    future: []
  });

  // Constraints: key is "id1-id2" (sorted), value is target distance
  const [constraints, setConstraints] = useState<Record<string, number>>({});
  
  // Helper to generate keypoints fitted to the current canvas size
  const generateFittedKeypoints = useCallback((targetWidth: number, targetHeight: number) => {
    const ys = DEFAULT_POSE_COORDS.map(p => p.y);
    const xs = DEFAULT_POSE_COORDS.map(p => p.x);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    
    const refHeight = maxY - minY;
    const refCenterY = (minY + maxY) / 2;
    const refCenterX = (minX + maxX) / 2;

    const targetPoseHeight = targetHeight * 0.75;
    const scaleFactor = targetPoseHeight / refHeight;

    return INITIAL_KEYPOINTS.map((kp, i) => {
      const def = DEFAULT_POSE_COORDS[i];
      // Center offset + scale
      const x = (def.x - refCenterX) * scaleFactor + (targetWidth / 2);
      const y = (def.y - refCenterY) * scaleFactor + (targetHeight / 2);
      return { ...kp, x, y };
    });
  }, []);

  // Initialize keypoints
  const [keypoints, setKeypoints] = useState<Keypoint[]>(() => 
    generateFittedKeypoints(512, 512)
  );

  // --- History Management ---

  const recordHistory = useCallback(() => {
    setHistory(curr => ({
      past: [...curr.past, { keypoints, constraints }],
      future: []
    }));
  }, [keypoints, constraints]);

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      
      setKeypoints(previous.keypoints);
      setConstraints(previous.constraints);

      return {
        past: newPast,
        future: [{ keypoints, constraints }, ...curr.future]
      };
    });
  }, [keypoints, constraints]);

  const redo = useCallback(() => {
    setHistory(curr => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      setKeypoints(next.keypoints);
      setConstraints(next.constraints);

      return {
        past: [...curr.past, { keypoints, constraints }],
        future: newFuture
      };
    });
  }, [keypoints, constraints]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);


  // Fit canvas to screen container
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    
    // Add some padding
    const padding = 64; 
    const availableWidth = clientWidth - padding;
    const availableHeight = clientHeight - padding;

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const scaleX = availableWidth / size.width;
    const scaleY = availableHeight / size.height;
    
    const newScale = Math.min(scaleX, scaleY);
    setScale(Math.min(newScale, 1));
  }, [size]);

  useEffect(() => {
    fitToScreen();
  }, [size, fitToScreen]);

  useEffect(() => {
    const handleResize = () => fitToScreen();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitToScreen]);

  const handleDragStart = useCallback(() => {
    recordHistory();
  }, [recordHistory]);

  const handleKeypointMove = useCallback((id: number, x: number, y: number) => {
    setKeypoints(prev => {
      const sourceKp = prev.find(k => k.id === id);
      if (!sourceKp) return prev;

      // 1. Identify connected component via locked constraints
      const connectedIds = new Set<number>();
      const queue = [id];
      connectedIds.add(id);
      
      let head = 0;
      while(head < queue.length) {
         const currId = queue[head++];
         // Iterate constraints to find neighbors
         Object.keys(constraints).forEach(key => {
            const [p1, p2] = key.split('-').map(Number);
            if (p1 === currId || p2 === currId) {
               const neighbor = p1 === currId ? p2 : p1;
               if (!connectedIds.has(neighbor)) {
                  connectedIds.add(neighbor);
                  queue.push(neighbor);
               }
            }
         });
      }

      if (lockedJointMode === 'translate') {
         // TRANSLATION MODE: Move the whole locked group
         const dx = x - sourceKp.x;
         const dy = y - sourceKp.y;
         
         return prev.map(kp => {
            if (connectedIds.has(kp.id)) {
               return { ...kp, x: kp.x + dx, y: kp.y + dy };
            }
            return kp;
         });
      } else {
         // ROTATION/CONSTRAINT MODE
         const activeConstraints = Object.entries(constraints).filter(([key]) => {
            const [p1, p2] = key.split('-').map(Number);
            return p1 === id || p2 === id;
         });

         let nextX = x;
         let nextY = y;

         if (activeConstraints.length > 0) {
            let sumX = 0;
            let sumY = 0;
            let count = 0;

            activeConstraints.forEach(([key, targetDist]) => {
               const [p1, p2] = key.split('-').map(Number);
               const otherId = p1 === id ? p2 : p1;
               const otherKp = prev.find(k => k.id === otherId);
               
               if (otherKp) {
                  const dx = x - otherKp.x;
                  const dy = y - otherKp.y;
                  const currentDist = Math.sqrt(dx * dx + dy * dy);
                  
                  if (currentDist > 0) {
                     const scale = (targetDist as number) / currentDist;
                     const constrainedX = otherKp.x + dx * scale;
                     const constrainedY = otherKp.y + dy * scale;
                     sumX += constrainedX;
                     sumY += constrainedY;
                     count++;
                  }
               }
            });

            if (count > 0) {
               nextX = sumX / count;
               nextY = sumY / count;
            }
         }

         return prev.map(kp => 
            kp.id === id ? { ...kp, x: nextX, y: nextY } : kp
         );
      }
    });
  }, [constraints, lockedJointMode]);

  const handleSkeletonDrag = useCallback((dx: number, dy: number) => {
    setKeypoints(prev => prev.map(kp => ({
      ...kp,
      x: kp.x + dx,
      y: kp.y + dy
    })));
  }, []);

  const handleToggleConstraint = useCallback((p1: number, p2: number) => {
    recordHistory();
    const key = [p1, p2].sort((a, b) => a - b).join('-');
    setConstraints(prev => {
      if (prev[key]) {
        const { [key]: deleted, ...rest } = prev;
        return rest;
      } else {
        const kp1 = keypoints.find(k => k.id === p1);
        const kp2 = keypoints.find(k => k.id === p2);
        if (!kp1 || !kp2) return prev;
        
        const dx = kp1.x - kp2.x;
        const dy = kp1.y - kp2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { ...prev, [key]: dist };
      }
    });
  }, [keypoints, recordHistory]);

  const handleToggleVisibility = useCallback((id: number) => {
    recordHistory();
    setKeypoints(prev => {
      const target = prev.find(k => k.id === id);
      if (!target) return prev;

      const newVisible = !target.visible;
      const idsToUpdate = new Set<number>();
      idsToUpdate.add(id);

      if (!newVisible) {
        const queue = [id];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const children = POSE_HIERARCHY[currentId];
          if (children) {
            children.forEach(childId => {
              if (!idsToUpdate.has(childId)) {
                idsToUpdate.add(childId);
                queue.push(childId);
              }
            });
          }
        }
      }

      return prev.map(kp => 
        idsToUpdate.has(kp.id) ? { ...kp, visible: newVisible ? (kp.id === id) : false } : kp
      );
    });
  }, [recordHistory]);

  const handleToggleLock = useCallback((id: number) => {
    recordHistory();
    setKeypoints(prev => prev.map(kp => 
      kp.id === id ? { ...kp, locked: !kp.locked } : kp
    ));
  }, [recordHistory]);

  const handleToggleAnchor = useCallback((id: number) => {
    recordHistory();
    setKeypoints(prev => prev.map(kp => 
      kp.id === id ? { ...kp, anchored: !kp.anchored } : kp
    ));
  }, [recordHistory]);

  // Global Toggle Handlers
  const handleToggleAllLock = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
      const allLocked = prev.every(kp => kp.locked);
      return prev.map(kp => ({ ...kp, locked: !allLocked }));
    });
  }, [recordHistory]);

  const handleToggleAllVisibility = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
      const allVisible = prev.every(kp => kp.visible);
      return prev.map(kp => ({ ...kp, visible: !allVisible }));
    });
  }, [recordHistory]);

  const handleReset = useCallback(() => {
    recordHistory();
    setConstraints({});
    setKeypoints(generateFittedKeypoints(size.width, size.height));
  }, [size, generateFittedKeypoints, recordHistory]);

  const handleFactoryReset = useCallback(() => {
     // Reset completely
     setSize({ width: 512, height: 512 });
     setBgImage(null);
     setBgAspectRatio(null);
     setBgOpacity(0.5);
     setBgTransform({ x: 0, y: 0, scale: 1 }); // Reset bg transform
     setEditorMode('pose'); // Reset mode
     setConstraints({});
     setLockedJointMode('translate');
     setKeypoints(generateFittedKeypoints(512, 512));
     setHistory({ past: [], future: [] });
     setLockCanvas(false);
     setKeepPose(true); // Default to keep pose on reset
     setLimbThickness(8);
     setSnapToEdges(false);
     fitToScreen(); // Reset editor zoom/scale
  }, [generateFittedKeypoints, fitToScreen]);

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const data = JSON.parse(content);
        
        // Basic validation
        if (!data || !data.people || !Array.isArray(data.people)) {
           alert("Invalid OpenPose JSON format: 'people' array missing.");
           return;
        }
        
        if (data.people.length === 0) {
           alert("No people found in JSON.");
           return;
        }

        recordHistory();

        // Canvas Config
        if (data.canvas_config) {
             const w = data.canvas_config.width;
             const h = data.canvas_config.height;
             if (w && h) setSize({ width: w, height: h });
        }

        const person = data.people[0];
        const kpArray = person.pose_keypoints_2d; // Array of numbers

        if (!kpArray || !Array.isArray(kpArray)) {
             alert("No 2D keypoints found.");
             return;
        }

        // Determine format based on length
        // COCO-18: 18 points * 3 = 54 numbers
        // BODY-25: 25 points * 3 = 75 numbers
        
        let newKeypoints = [...keypoints];
        
        const getKeypoint = (idx: number) => {
            const base = idx * 3;
            if (base + 2 >= kpArray.length) return null;
            return {
                x: kpArray[base],
                y: kpArray[base + 1],
                c: kpArray[base + 2]
            };
        };

        if (kpArray.length >= 75) {
             // Handle BODY_25 mapping to COCO
             const mapping = [
                0, 1, 2, 3, 4, 5, 6, 7, // 0-7 identity
                9, 10, 11, // 8-10 (RHip, RKnee, RAnkle) -> Body25 9,10,11
                12, 13, 14, // 11-13 (LHip, LKnee, LAnkle) -> Body25 12,13,14
                15, 16, 17, 18 // 14-17 (Eyes, Ears) -> Body25 15,16,17,18
             ];
             
             newKeypoints = newKeypoints.map((kp, i) => {
                 const srcIdx = mapping[i];
                 const val = getKeypoint(srcIdx);
                 if (val) {
                     return { ...kp, x: val.x, y: val.y, visible: val.x !== 0 || val.y !== 0 };
                 }
                 return kp;
             });

        } else {
             // Assume COCO-18 or similar (direct mapping)
             newKeypoints = newKeypoints.map((kp, i) => {
                 const val = getKeypoint(i);
                 if (val) {
                     return { ...kp, x: val.x, y: val.y, visible: val.x !== 0 || val.y !== 0 };
                 }
                 return kp;
             });
        }
        
        setKeypoints(newKeypoints);
        setConstraints({});
        
      } catch (error) {
         console.error(error);
         alert("Error parsing JSON file.");
      }
      
      // Reset input value to allow re-uploading same file
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!keepPose) recordHistory();

      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = evt.target?.result as string;
        setBgImage(result);
        setBgTransform({ x: 0, y: 0, scale: 1 }); // Reset bg transform on new upload
        
        const img = new Image();
        img.onload = () => {
          let targetWidth = size.width;
          let targetHeight = size.height;
          setBgAspectRatio(img.width / img.height);

          if (!lockCanvas) {
            targetWidth = img.width;
            targetHeight = img.height;
            setSize({ width: targetWidth, height: targetHeight });
          }

          if (!keepPose) {
            setKeypoints(generateFittedKeypoints(targetWidth, targetHeight));
            setConstraints({});
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAutoDetect = async () => {
    if (!bgImage) return;
    recordHistory();
    setIsProcessing(true);
    setConstraints({});
    
    try {
      const detectedPoints = await detectPose(bgImage, size.width, size.height);
      if (detectedPoints && detectedPoints.length === 18) {
        setKeypoints(prev => prev.map((kp, i) => ({
          ...kp,
          x: detectedPoints[i].x,
          y: detectedPoints[i].y,
          visible: true
        })));
      } else {
        alert("Could not detect a valid pose. Please try a clearer image.");
      }
    } catch (e) {
      console.error(e);
      alert("Error detecting pose.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Helper for calculating center of visible pose ---
  const getPoseCenter = (kps: Keypoint[]) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let count = 0;
    
    kps.forEach(kp => {
      if (kp.visible) {
        minX = Math.min(minX, kp.x);
        maxX = Math.max(maxX, kp.x);
        minY = Math.min(minY, kp.y);
        maxY = Math.max(maxY, kp.y);
        count++;
      }
    });

    if (count === 0) return null;
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  };

  const getPivotPoint = (kps: Keypoint[]) => {
      const anchors = kps.filter(k => k.anchored);
      if (anchors.length > 0) {
          const sumX = anchors.reduce((acc, k) => acc + k.x, 0);
          const sumY = anchors.reduce((acc, k) => acc + k.y, 0);
          return { x: sumX / anchors.length, y: sumY / anchors.length };
      }
      const center = getPoseCenter(kps);
      return center || { x: size.width / 2, y: size.height / 2 };
  };

  // Flip Handlers
  const handleFlipHorizontal = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
      const center = getPoseCenter(prev);
      const cx = center ? center.x : size.width / 2;
      
      return prev.map(kp => ({
        ...kp,
        x: cx + (cx - kp.x)
      }));
    });
  }, [recordHistory, size.width]);

  const handleFlipVertical = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
      const center = getPoseCenter(prev);
      const cy = center ? center.y : size.height / 2;
      
      return prev.map(kp => ({
        ...kp,
        y: cy + (cy - kp.y)
      }));
    });
  }, [recordHistory, size.height]);

  const handleMirrorLeftToRight = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
        // Find axis: Prefer Neck (1), then Nose (0)
        let axisX = size.width / 2;
        const neck = prev.find(k => k.id === 1);
        const nose = prev.find(k => k.id === 0);
        
        if (neck && neck.visible) axisX = neck.x;
        else if (nose && nose.visible) axisX = nose.x;
        // Could optionally fallback to midpoint of hips if Neck/Nose missing
        
        const newKps = [...prev];
        const pairs = [
             { r: 2, l: 5 }, { r: 3, l: 6 }, { r: 4, l: 7 },
             { r: 8, l: 11 }, { r: 9, l: 12 }, { r: 10, l: 13 },
             { r: 14, l: 15 }, { r: 16, l: 17 }
        ];

        pairs.forEach(({r, l}) => {
            const leftKp = prev.find(k => k.id === l);
            if (leftKp) {
                const rightIndex = newKps.findIndex(k => k.id === r);
                if (rightIndex !== -1) {
                     newKps[rightIndex] = {
                         ...newKps[rightIndex],
                         x: axisX + (axisX - leftKp.x),
                         y: leftKp.y,
                         visible: leftKp.visible
                     };
                }
            }
        });
        return newKps;
    });
  }, [recordHistory, size.width]);

  const handleMirrorRightToLeft = useCallback(() => {
    recordHistory();
    setKeypoints(prev => {
        // Find axis
        let axisX = size.width / 2;
        const neck = prev.find(k => k.id === 1);
        const nose = prev.find(k => k.id === 0);
        
        if (neck && neck.visible) axisX = neck.x;
        else if (nose && nose.visible) axisX = nose.x;

        const newKps = [...prev];
        const pairs = [
             { r: 2, l: 5 }, { r: 3, l: 6 }, { r: 4, l: 7 },
             { r: 8, l: 11 }, { r: 9, l: 12 }, { r: 10, l: 13 },
             { r: 14, l: 15 }, { r: 16, l: 17 }
        ];

        pairs.forEach(({r, l}) => {
            const rightKp = prev.find(k => k.id === r);
            if (rightKp) {
                const leftIndex = newKps.findIndex(k => k.id === l);
                if (leftIndex !== -1) {
                     newKps[leftIndex] = {
                         ...newKps[leftIndex],
                         x: axisX + (axisX - rightKp.x),
                         y: rightKp.y,
                         visible: rightKp.visible
                     };
                }
            }
        });
        return newKps;
    });
  }, [recordHistory, size.width]);

  // Scaling & Rotation Logic
  const transformBaseRef = useRef<{ keypoints: Keypoint[], constraints: Record<string, number> } | null>(null);

  const handleScaleStart = useCallback(() => {
    recordHistory();
    transformBaseRef.current = {
      keypoints: keypoints,
      constraints: constraints
    };
  }, [keypoints, constraints, recordHistory]);

  const handleScale = useCallback((factor: number) => {
    if (!transformBaseRef.current) return;

    const baseKeypoints = transformBaseRef.current.keypoints;
    const baseConstraints = transformBaseRef.current.constraints;

    const { x: centerX, y: centerY } = getPivotPoint(baseKeypoints);

    const newKeypoints = baseKeypoints.map(kp => ({
      ...kp,
      x: centerX + (kp.x - centerX) * factor,
      y: centerY + (kp.y - centerY) * factor
    }));
    setKeypoints(newKeypoints);

    const newConstraints: Record<string, number> = {};
    Object.entries(baseConstraints).forEach(([key, dist]) => {
      newConstraints[key] = (dist as number) * factor;
    });
    setConstraints(newConstraints);

  }, [size]);

  const handleTransformStart = useCallback(() => {
    recordHistory();
    setIsTransforming(true);
    transformBaseRef.current = {
      keypoints: keypoints,
      constraints: constraints
    };
  }, [keypoints, constraints, recordHistory]);

  const handleTransform = useCallback((rotateZ: number, scaleX: number) => {
    if (!transformBaseRef.current) return;

    const baseKeypoints = transformBaseRef.current.keypoints;
    const { x: cx, y: cy } = getPivotPoint(baseKeypoints);

    // Convert degrees to radians
    const radZ = (rotateZ * Math.PI) / 180;

    const newKeypoints = baseKeypoints.map(kp => {
      // Relative to center
      let rx = kp.x - cx;
      let ry = kp.y - cy;

      // Apply Width Scaling (Perspective/Turn simulation)
      rx = rx * scaleX;

      // Apply 2D Spin (Z-Axis rotation)
      const rotatedX = rx * Math.cos(radZ) - ry * Math.sin(radZ);
      const rotatedY = rx * Math.sin(radZ) + ry * Math.cos(radZ);

      return {
        ...kp,
        x: cx + rotatedX,
        y: cy + rotatedY
      };
    });

    setKeypoints(newKeypoints);
  }, [size]);

  const handleTransformEnd = useCallback(() => {
    setIsTransforming(false);
    transformBaseRef.current = null;
    
    // Recalculate constraints based on new positions to avoid snapping back
    setConstraints(prev => {
       const newConstraints: Record<string, number> = {};
       Object.keys(prev).forEach(key => {
         const [p1, p2] = key.split('-').map(Number);
         const kp1 = keypoints.find(k => k.id === p1);
         const kp2 = keypoints.find(k => k.id === p2);
         if(kp1 && kp2) {
            const dist = Math.sqrt(Math.pow(kp1.x - kp2.x, 2) + Math.pow(kp1.y - kp2.y, 2));
            newConstraints[key] = dist;
         }
       });
       return newConstraints;
    });

  }, [keypoints]); // depend on keypoints to get the final state

  // Exports
  const handleExportPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size.width, size.height);

    CONNECTIONS.forEach(conn => {
      const kp1 = keypoints[conn.p1];
      const kp2 = keypoints[conn.p2];
      if (kp1.visible && kp2.visible) {
        ctx.beginPath();
        ctx.moveTo(kp1.x, kp1.y);
        ctx.lineTo(kp2.x, kp2.y);
        ctx.strokeStyle = `rgb(${conn.rgb.join(',')})`;
        ctx.lineWidth = limbThickness;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    });

    keypoints.forEach(kp => {
      if (kp.visible) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = `rgb(${kp.rgb.join(',')})`;
        ctx.fill();
      }
    });

    const link = document.createElement('a');
    link.download = 'openpose_skeleton.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportJson = () => {
    const data = {
      version: 1.3,
      people: [
        {
          pose_keypoints_2d: keypoints.flatMap(kp => [
             Math.round(kp.x), 
             Math.round(kp.y), 
             kp.visible ? 1 : 0 
          ])
        }
      ],
      canvas_config: {
        width: size.width,
        height: size.height
      },
      keypoints_details: keypoints.map(kp => ({
        id: kp.id,
        name: kp.name,
        x: Math.round(kp.x),
        y: Math.round(kp.y),
        visible: kp.visible
      }))
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'openpose_data.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBackground = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background with #808080
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size.width, size.height);

    if (bgImage) {
      const img = new Image();
      img.onload = () => {
        // Calculate the base dimensions as they appear in "object-fit: contain"
        // before any user transform is applied.
        let baseW = size.width;
        let baseH = size.height;
        const imgAspect = img.width / img.height;
        const canvasAspect = size.width / size.height;

        if (imgAspect > canvasAspect) {
          // Wider than canvas: width fits, height adapts
          baseW = size.width;
          baseH = size.width / imgAspect;
        } else {
          // Taller than canvas: height fits, width adapts
          baseH = size.height;
          baseW = size.height * imgAspect;
        }

        ctx.save();
        
        // 1. Move origin to center of canvas
        ctx.translate(size.width / 2, size.height / 2);
        
        // 2. Apply user-defined transform (pan and zoom)
        ctx.translate(bgTransform.x, bgTransform.y);
        ctx.scale(bgTransform.scale, bgTransform.scale);
        
        // 3. Draw image centered at the current origin
        ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
        
        ctx.restore();

        const link = document.createElement('a');
        link.download = 'processed_background.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      img.src = bgImage;
    } else {
      // No image, just gray background
      const link = document.createElement('a');
      link.download = 'processed_background.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-zinc-950 overflow-hidden">
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col relative">
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto flex items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950"
        >
          <div className="shadow-2xl ring-1 ring-zinc-800">
            <Editor
              width={size.width}
              height={size.height}
              backgroundImage={bgImage}
              bgAspectRatio={bgAspectRatio}
              keypoints={keypoints}
              onKeypointMove={handleKeypointMove}
              onDragStart={handleDragStart}
              scale={scale}
              constraints={constraints}
              isReadOnly={isTransforming}
              onToggleLock={handleToggleLock}
              onToggleVisibility={handleToggleVisibility}
              bgOpacity={bgOpacity}
              onSkeletonDrag={handleSkeletonDrag}
              editorMode={editorMode}
              bgTransform={bgTransform}
              onBgTransformChange={setBgTransform}
              onToggleConstraint={handleToggleConstraint}
              limbThickness={limbThickness}
              snapToEdges={snapToEdges}
              onToggleAnchor={handleToggleAnchor}
            />
          </div>
        </div>
        
        {/* Zoom Controls overlay */}
        <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-lg p-2 flex items-center gap-2">
           <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1 hover:bg-zinc-700 rounded text-zinc-300">-</button>
           <span className="text-xs text-zinc-400 w-12 text-center">{Math.round(scale * 100)}%</span>
           <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1 hover:bg-zinc-700 rounded text-zinc-300">+</button>
           <button onClick={fitToScreen} className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300 ml-2 hover:bg-zinc-700">Fit</button>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar
        keypoints={keypoints}
        onToggleVisibility={handleToggleVisibility}
        onReset={handleReset}
        onImageUpload={handleImageUpload}
        onExportPng={handleExportPng}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onClearImage={() => {
            setBgImage(null);
            setBgAspectRatio(null);
            setBgTransform({ x: 0, y: 0, scale: 1 });
        }}
        isProcessing={isProcessing}
        onAutoDetect={handleAutoDetect}
        hasImage={!!bgImage}
        canvasSize={size}
        onSizeChange={(w, h) => setSize({ width: w, height: h })}
        constraints={constraints}
        onToggleConstraint={handleToggleConstraint}
        lockCanvas={lockCanvas}
        onToggleLockCanvas={() => setLockCanvas(prev => !prev)}
        keepPose={keepPose}
        onToggleKeepPose={() => setKeepPose(prev => !prev)}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onScaleStart={handleScaleStart}
        onScale={handleScale}
        onToggleLock={handleToggleLock}
        onTransformStart={handleTransformStart}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        onFlipHorizontal={handleFlipHorizontal}
        onFlipVertical={handleFlipVertical}
        onMirrorLeftToRight={handleMirrorLeftToRight}
        onMirrorRightToLeft={handleMirrorRightToLeft}
        bgOpacity={bgOpacity}
        onBgOpacityChange={setBgOpacity}
        onToggleAllLock={handleToggleAllLock}
        onToggleAllVisibility={handleToggleAllVisibility}
        onFactoryReset={handleFactoryReset}
        editorMode={editorMode}
        onSetEditorMode={setEditorMode}
        limbThickness={limbThickness}
        onLimbThicknessChange={setLimbThickness}
        snapToEdges={snapToEdges}
        onToggleSnapToEdges={() => setSnapToEdges(prev => !prev)}
        onExportBackground={handleExportBackground}
        lockedJointMode={lockedJointMode}
        onSetLockedJointMode={setLockedJointMode}
      />
    </div>
  );
};

export default App;