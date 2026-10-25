(function (root) {
  'use strict';

  function render(canvas, scene, nodes, assets, selected, running, imageFor) {
    const width = Math.max(64, Math.min(4096, Number(scene.width) || 960));
    const height = Math.max(64, Math.min(4096, Number(scene.height) || 540));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = scene.background || '#1c2023';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const size = Math.max(8, Math.min(128, Number(scene.tileSize) || 32));
    const camera = running ? nodes.find(node => node.type === 'camera') : null;
    ctx.save();
    if (camera) ctx.translate(-(camera.x || 0), -(camera.y || 0));
    for (const [key, color] of Object.entries(scene.tiles || {})) {
      const [column, row] = key.split(',').map(Number);
      const x = column * size, y = row * size;
      if (!Number.isInteger(column) || !Number.isInteger(row) || x >= width || y >= height || !color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, Math.min(size, width - x), Math.min(size, height - y));
    }

    if (!running) {
      ctx.beginPath();
      ctx.strokeStyle = '#e5ecee22';
      ctx.lineWidth = 1;
      for (let x = 0.5; x <= width; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      for (let y = 0.5; y <= height; y += size) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
      ctx.stroke();
    }

    for (const node of nodes.filter(item => ['sprite', 'camera'].includes(item.type))) {
      const x = Number(node.x) || 0, y = Number(node.y) || 0;
      const w = Math.max(1, Number(node.width) || 64), h = Math.max(1, Number(node.height) || 64);
      if (node.type === 'sprite') {
        const asset = assets.find(item => item.id === node.assetId);
        const image = imageFor(asset);
        if (image?.complete && image.naturalWidth) ctx.drawImage(image, x, y, w, h);
        else { ctx.fillStyle = node.color || '#d2d9dc'; ctx.fillRect(x, y, w, h); }
      }
      if (!running && (node.id === selected || node.type === 'camera')) {
        ctx.strokeStyle = node.id === selected ? '#ffffff' : '#87969f';
        ctx.lineWidth = 2;
        ctx.setLineDash(node.type === 'camera' ? [8, 5] : []);
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  root.AsternalRenderer = { render };
})(globalThis);
