var scene = new THREE.Scene();
var orthographicCamera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0.1, 100000);
var spriteCamera = orthographicCamera.clone();
var spriteScene = new THREE.Scene();
var camera = orthographicCamera;
var cameras = {'orthographic': orthographicCamera};
spriteCamera.position.z = 80;
spriteCamera.zoom = 6;
spriteCamera.updateProjectionMatrix();
var reset_camera = function(cams) {
  ortho = cams['orthographic'];
  ortho.position.set(0, 0, 1000);
  ortho.zoom = 5;
  ortho.rotation.set(0, 0, 0);
  ortho.updateProjectionMatrix();
};
reset_camera(cameras);

var frontLight = new THREE.DirectionalLight(0xaaaaaa);
frontLight.position.set(0, 50, 100);
scene.add(frontLight);
var backLight = new THREE.DirectionalLight(0xaaaaaa);
backLight.position.set(0, -50, -100);
scene.add(backLight);
var sideLight = new THREE.DirectionalLight(0xaaaaaa);
sideLight.position.set(-300, -50, 100);
scene.add(sideLight);
var rightLight = new THREE.DirectionalLight(0xaaaaaa);
rightLight.position.set(300, 0, 100);
scene.add(rightLight);

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
$('canvas').css({'display': 'block'});
renderer.autoClear = false;

scene.background = new THREE.Color(0xe7e7e7);
orthographicControls = new THREE.OrbitControls(orthographicCamera, renderer.domElement);

var pixelOffset = {'x': -100, 'y': -100};

var loadGeometry = function(geometryFile, pixelMeshes, pixelMaterial) {
  var pixelPadGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1);
  $.get('static/geometries/' + geometryFile, function(rawPixelGeometry) {
    for(i in pixelMeshes) {
      scene.remove(pixelMeshes[i]);
    }
    pixelGeometry = jsyaml.load(rawPixelGeometry);
    pixels = pixelGeometry['pixels'];
    chips = pixelGeometry['chips'];
    activePixels = []
    for(var i in chips) {
      activePixels = activePixels.concat(chips[i][1]);
    }
    for(var i = 0; i < pixels.length; i++) {
      pixel = pixels[i];
      x = pixel[1]+pixelOffset.x;
      y = pixel[2]+pixelOffset.y;
      if(activePixels.indexOf(pixel[0]) >= 0) {
        pixelMesh = new THREE.Mesh(pixelPadGeometry, pixelMaterial);
        pixelMesh.position.z = 0;
        pixelMesh.position.x = x;
        pixelMesh.position.y = y;
        pixelMesh.rotation.x = 3.14159/2;
        pixelMeshes.push(pixelMesh);
        scene.add(pixelMesh);
      }
    }
  }, 'text');
};


/**
 * Find the next group of data points (after index <start>) with <n>
 * hits within time window <dt>.
 */
var nextGroup = function(data, start, n, dt) {
  index = start;
  time = 8;
  t0 = data[index][time];
  maxIndex = data.length - n;
  groupSize = 1;
  while(groupSize < n && index < maxIndex) {
    nextEvent = data[index + groupSize];
    if(Math.abs(nextEvent[time] - t0) < dt) {
      // Then look for more events all within dt
      groupSize++;
    }
    else {
      // Then pick the next t0 and start again
      index++;
      groupSize = 1;
      t0 = data[index][time];
    }
  }
  return index;
};

var nextGroupHelp = function() {
  helpText = 'Display the next cluster of hits all within a given time window.';
  helpText += '\n\n';
  helpText += '- dt is the time window in microseconds\n';
  helpText += '- cluster_size is the number of hits required within dt\n';
  helpText += '- nhits is the number of hits to display\n';
  alert(helpText);
};

/**
 * Find all of the hits between the next time gap of <dt> and the time gap
 * after that.
 */
var nextGapGroup = function(data, start, dt) {
  time = 8;
  /*
   * Return the last index before a big gap of dt
   */
  var findNextGap = function(data, sub_start, dt) {
    sub_index = sub_start
    // Find the next gap
    t0 = data[sub_index][time];
    t1 = data[sub_index+1][time];
    while(t1 - t0 < dt && sub_index < data.length-1) {
      sub_index++;
      t0 = t1;
      t1 = data[sub_index+1][time];
    }
    return sub_index;
  }
  first_good_hit = findNextGap(data, start, dt) + 1;
  last_good_hit = findNextGap(data, first_good_hit, dt);
  return [first_good_hit, last_good_hit];
};

var parseURL = function(metadata) {
  // Parse URL to see if we should load a particular event
  var currentURL = new URI(window.location.href);
  var query = currentURL.query(true);
  for(key in controllerMap) {
    if(query.hasOwnProperty(key)) {
      var value = Number(query[key]);
      if(!value) {
        value = query[key];
      }
      controllerMap[key].setValue(value);
    }
  }
};

var nextGapGroupHelp = function() {
  helpText = 'Display the next hit group with large empty gaps before and after.';
  helpText += '\n\n';
  helpText += '- dt is the time separation before or after the hit group\n';
  helpText += '- cluster_size is the minimum number of hits in the group\n';
  helpText += '- nhits will display the number of hits in the group\n';
  alert(helpText);
};

var updateLegend = function(metadata) {
  var low_index = metadata['Hit index'];
  var high_index = low_index + metadata['Hits displayed'] - 1;
  var data = metadata['data'];
  var unixTime_ms = data[low_index][8] / 1e6;
  var time = new Date(unixTime_ms);
  $('#event-time').text('Time: ' + time.toUTCString());
  $('#event-index').text('Event index range: ' + low_index + ' -> ' + high_index);
  $('#data-file').text('Data file: ' + metadata['Data file']);
};

var loadFileList = function(metadata, gui, pixelMeshes, pixelMaterial, hitMeshes, adcScale) {
  $.getJSON('static/data/fileList.json', function(list) {
    metadata['fileList'] = list;
    filePicker = gui.add(metadata, 'Data file', [''].concat(getFileNames(metadata['fileList'])));
    controllerMap['Data file'] = filePicker;
    filePicker.onChange(function(newFileName) {
      retrieveFile(newFileName, hitMeshes, metadata, adcScale);
      loadGeometry(lookUpGeometry(metadata['fileList'], newFileName), pixelMeshes, pixelMaterial);
      updateURL('Data file', newFileName);
    });
    parseURL(metadata);
  });
};
var getFileNames = function(fileList) {
  files = [];
  for(i in fileList) {
    files.push(fileList[i]['name']);
  }
  return files;
};
var lookUpGeometry = function(fileList, fileName) {
  for(i in fileList) {
    info = fileList[i];
    if(info['name'] === fileName) {
      return info['geometry'];
    }
  }
};


var retrieveFile = function(fileName, hitMeshes, metadata, adcScale) {
  if(localStorage.getItem(fileName)) {
    var data = JSON.parse(localStorage.getItem(fileName));
    loadData(metadata, data, hitMeshes, adcScale);
  }
  else {
  $.getJSON('static/data/' + fileName, function(data) {
    try {
      localStorage.setItem(fileName, JSON.stringify(data));
    }
    finally {
      loadData(metadata, data, hitMeshes, adcScale);
    }
  });
  }
};

var resetIndexes = function(metadata, controllerMap) {
  controllerMap['min_index'].setValue(0);
  controllerMap['max_index'].setValue(metadata['data'].length);
  controllerMap['Hit index'].setValue(0);
  if(metadata['default_hits_displayed'] > metadata['max_index']) {
    controllerMap['Hits displayed'].setValue(metadata['max_index']);
  }
  else {
    controllerMap['Hits displayed'].setValue(metadata['default_hits_displayed']);
  }
};

var loadNextCluster = function(gui_metadata, hitMeshes, adcScale) {
    var data = gui_metadata.data;
    index = gui_metadata['Hit index'] + gui_metadata['Multiplicity cut'];
    nhits = gui_metadata['Multiplicity cut'];
    dt = gui_metadata['Time cut'] * 1000;
    indexController = controllerMap['Hit index'];
    next_index = nextGroup(data, index, nhits, dt);
    gui_metadata.max_index = next_index + 3*gui_metadata['Hits displayed'];
    indexController.__max = gui_metadata.max_index;
    gui_metadata.min_index = next_index - 3*gui_metadata['Hits displayed'];
    indexController.__min = gui_metadata.min_index;
    gui_metadata['Hit index'] = next_index;
    for(var key in controllerMap) {
      if(key === 'Data file') {
        continue;
      }
      controller = controllerMap[key];
      controller.setValue(controller.getValue());
    }
    clearObjects(hitMeshes);
    loadHits(gui_metadata, hitMeshes, adcScale);
};

var loadNextAntiCluster = function(gui_metadata, hitMeshes, adcScale) {
    var data = gui_metadata.data;
    index = gui_metadata['Hit index'];
    dt = gui_metadata['Time cut'] * 1000;
    indexController = controllerMap['Hit index'];
    good_range = [];
    nhits = 0;
    while(nhits < gui_metadata['Multiplicity cut']) {
      good_range = nextGapGroup(data, index, dt);
      nhits = good_range[1] - good_range[0] + 1;
      index = good_range[0];
    }
    gui_metadata['Hits displayed'] = nhits;
    gui_metadata.max_index = good_range[1] + 2*nhits;
    gui_metadata.min_index = good_range[0] - 2*nhits;
    indexController.__max = gui_metadata.max_index;
    indexController.__min = gui_metadata.min_index;
    gui_metadata['Hit index'] = good_range[0];
    for(var key in controllerMap) {
      if(key === 'Data file') {
        continue;
      }
      controller = controllerMap[key];
      controller.setValue(controller.getValue());
    }
    clearObjects(hitMeshes);
    loadHits(gui_metadata, hitMeshes, adcScale);
};
var updateURL = function(key, value) {
  var url = new URI(window.location.href);
  url.removeSearch(key);
  url.addSearch(key, value);
  window.history.replaceState(null, '', url.toString());
};

var setUpGUI = function(metadata, gui, gui_colors, hitMeshes, adcScale, pixelMaterial) {
  var hitIndex = gui.add(metadata, 'Hit index', 0, 1000000).step(1);
  var nextGap = gui.add(metadata, 'Next event');
  var nextNhits = gui.add(metadata, 'Next hits');
  var cameraReseter = gui.add(metadata, 'Reset camera');
  var tooltipEnable = gui.add(metadata, 'Tooltips');
  var filePicker;

  var detailsFolder = gui.addFolder('Details');
  var colorsFolder = gui.addFolder('Colors');
  var helpFolder = gui.addFolder('Help');

  var nHits = detailsFolder.add(metadata, 'Hits displayed', 0).step(1);
  var clusterSize = detailsFolder.add(metadata, 'Multiplicity cut', 0).step(1);
  var dt = detailsFolder.add(metadata, 'Time cut').step(1);
  var zScale = detailsFolder.add(metadata, 'Z scale', 100, 5000).step(50);
  var minIndex = detailsFolder.add(metadata, 'min_index', 0, 1000000).step(1);
  var maxIndex = detailsFolder.add(metadata, 'max_index', 0, 1000000).step(1);

  var useLambertMaterial = colorsFolder.add(metadata, 'shading');
  var color_background = colorsFolder.addColor(gui_colors, 'background').listen();
  var color_active_pixel = colorsFolder.addColor(gui_colors, 'active_pixel').listen();
  var isNight = colorsFolder.add(gui_colors, 'Night mode').listen();
  var colorReseter = colorsFolder.add(gui_colors, 'Reset colors');

  var nextNhitsHelp = helpFolder.add(metadata, 'Cluster help');
  var nextGapHelp = helpFolder.add(metadata, 'Anticluster help');
  var controllerMap = {
    'Data file': filePicker,
    'Hit index': hitIndex,
    'Hits displayed': nHits,
    'Multiplicity cut': clusterSize,
    'Time cut': dt,
    'Z scale': zScale,
    'min_index': minIndex,
    'max_index': maxIndex,
  };
  hitIndex.onChange(function(newIndex) {
    clearObjects(hitMeshes);
    loadHits(metadata, hitMeshes, adcScale);
    updateURL('Hit index', newIndex);
  });
  nHits.onChange(function(newNHits) {
    clearObjects(hitMeshes);
    loadHits(metadata, hitMeshes, adcScale);
    updateURL('Hits displayed', newNHits);
  });
  zScale.onChange(function(newZScale) {
    clearObjects(hitMeshes);
    loadHits(metadata, hitMeshes, adcScale);
    updateURL('Z scale', newZScale);
  });
  minIndex.onChange(function(newMin) {
    controllerMap['Hit index'].__min = newMin;
    updateURL('min_index', newMin);
  });
  maxIndex.onChange(function(newMax) {
    controllerMap['Hit index'].__max = newMax;
    updateURL('max_index', newMax);
  });
  useLambertMaterial.onChange(function(newUseLambertMaterial) {
    clearObjects(hitMeshes);
    loadHits(metadata, hitMeshes, adcScale);
  });
  color_background.onChange(function(newColor) {
    scene.background = new THREE.Color(newColor);
  });
  color_active_pixel.onChange(function(newColor) {
    pixelMaterial.color = new THREE.Color(newColor);
  });
  isNight.onChange(function(night) {
    if(night) {
      newColor = '#272727'
    }
    else {
      newColor = '#a7a7a7'
    }
    gui_colors.background = newColor;
    gui_colors['_background_color'](newColor);
  });
  return controllerMap;
};

function clearObjects(objectsToClear) {
  while(objectsToClear.length > 0) {
    scene.remove(objectsToClear.pop());
  }
};

function placeText(text, position, fillColor, strokeColor, fontSize) {
  canvas = document.createElement('canvas');
  canvas.height = 100;
  canvas.width = 350;
  context = canvas.getContext('2d');
  context.font = fontSize + ' Helvetica';
  context.fillStyle = fillColor;
  context.strokeStyle = strokeColor;
  context.fillText(text, 30, 99);
  if(strokeColor != null) {
    context.strokeText(text, 30, 99);
  }
  texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  material = new THREE.MeshBasicMaterial({map: texture, side:THREE.DoubleSide});
  material.transparent = true;
  mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(canvas.width, canvas.height),
      material
      );
  scale = 0.05;
  mesh.scale.set(scale, scale, scale);
  mesh.position.set(position[0] + canvas.width/2 * scale, position[1], position[2]);
  spriteScene.add(mesh);

  return mesh;
};

function loadColorMap(scale, position) {
  nSwatches = 60;
  domain = scale.domain();
  low = domain[0];
  diff = domain[1] - low;
  delta = diff/(nSwatches-1);
  width = 6;
  height = 0.5;
  depth = 0.1;
  inputs = [];
  colors = [];
  materials = [];
  swatches = [];
  for(var i = 0; i < nSwatches; i++) {
    inputs.push(low + i*delta);
    colors.push(scale(inputs[i]).hex());
    materials.push(new THREE.SpriteMaterial({color: colors[i]}));
    swatches.push(new THREE.Sprite(materials[i]));
    swatches[i].position.set(position[0], position[1]+i*height, position[2]);
    swatches[i].scale.set(width, height, 1);
    swatches[i].transparent = false;
    spriteScene.add(swatches[i]);
  }
  mesh = placeText(low,
      [position[0] + width, position[1], position[2]],
      0x000000,
      null,
      '80px'
  );
  mesh = placeText(low+diff,
      [position[0] + width, position[1] + nSwatches * height, position[2]],
      0x000000,
      null,
      '80px'
  );
  mesh = placeText('mV',
      [position[0] - 3, position[1] + nSwatches*height + 5, position[2]],
      0x000000,
      null,
      '80px'
  );

};

var setUpColorScale = function() {
  /*
  var adcScale = chroma.cubehelix()
    .lightness([0.1, 0.9])
    .start(300)
    .hue(2)
    .gamma(1)
    .rotations(-1).scale().domain([0, 100]).classes(7);
  */
  //var adcScale = chroma.scale(['violet', 'blue', 'green', 'yellow', 'orange', 'red']).domain([0, 100]).classes(6);
  var adcScale = chroma.scale(['6c71c4', '2aa198', '859900', 'b58900', 'dc322f']).domain([0, 100]).classes(5);
  //var adcScale = chroma.scale(['02fcff', 'fd00ff']).domain([0, 100]).classes(6);
  //var adcScale = chroma.scale('RdBu').domain([0, 100]).classes(5);
  loadColorMap(adcScale, [window.innerWidth/15, -window.innerHeight/15, 0]);
  return adcScale;
};

var setUpRuler = function() {
  // Set up the ruler
  rulerMaterial = new THREE.LineBasicMaterial({color: 0x000000, linewidth: 3});
  rulerGeometry = new THREE.Geometry();
  rulerGeometry.vertices.push(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5));
  rulerGeometry.computeLineDistances();
  timeScaleMesh = new THREE.Line(rulerGeometry, rulerMaterial);
  xScaleMesh = new THREE.Line(rulerGeometry, rulerMaterial);
  yScaleMesh = new THREE.Line(rulerGeometry, rulerMaterial);
  timeScaleMesh.position.set(-50, -30, 5);
  xScaleMesh.rotation.y = 3.14159/2;
  xScaleMesh.position.set(-45, -30, 0);
  yScaleMesh.rotation.x = 3.14159/2;
  yScaleMesh.position.set(-50, -25, 0);
  scene.add(timeScaleMesh);
  scene.add(xScaleMesh);
  scene.add(yScaleMesh);
  // Set up labels
  canvas = document.createElement('canvas');
  context = canvas.getContext('2d');
  context.font = '60px Helvetica';
  context.fillStyle = 'rgba(0, 0, 0, 1)';
  context.fillText('1 cm', 0, 60);
  texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  material = new THREE.SpriteMaterial({ map: texture, useScreenCoordinates: false });
  var xsprite = new THREE.Sprite(material);
  xsprite.scale.set(10, 10, 1);
  xsprite.position.set(-40, -30, 0);
  var ysprite = xsprite.clone();
  ysprite.position.set(-50, -24, 0);
  canvas = document.createElement('canvas');
  context = canvas.getContext('2d');
  context.font = '60px Helvetica';
  context.fillStyle = 'rgba(0, 0, 0, 1)';
  context.fillText('10 us', 0, 60);
  texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  material = new THREE.SpriteMaterial({ map: texture, useScreenCoordinates: false });
  var zsprite = new THREE.Sprite(material);
  zsprite.scale.set(10, 10, 1);
  zsprite.position.set(-50, -30, 10);
  scene.add(xsprite);
  scene.add(ysprite);
  scene.add(zsprite);
};
function loadHits(gui_metadata, hitMeshes, adcScale) {
  var data = gui_metadata['data'];
  index = gui_metadata['Hit index'];
  nhits = gui_metadata['Hits displayed'];
  zDivisor = gui_metadata['Z scale'];
  useLambert = gui_metadata['shading'];
  timeScaleMesh.scale.z = 1000/zDivisor;
  timeScaleMesh.position.set(-50, -30, 10*timeScaleMesh.scale.z/2);
  var MeshMaterial = null;
  if(useLambert) {
    MeshMaterial = THREE.MeshLambertMaterial;
  }
  else {
    MeshMaterial = THREE.MeshBasicMaterial;
  }

  color_values = [];
  times = [];
  // Sort hits
  hits = data.slice(index, index + nhits);
  hits.sort(function(a, b) { return a[8] - b[8]; });
  for(var i = 0; i < hits.length; i++) {
    hit = hits[i];
    x = hit[3]/10.0;
    y = hit[4]/10.0;
    color_value = hit[10] - hit[11];
    time = hit[8] - hits[0][8];
    z = time/zDivisor;
    hitMaterial = new MeshMaterial({color: adcScale(color_value).hex()});
    hitGeometry = new THREE.CylinderGeometry(1, 1, 1);
    hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    hitMesh.position.z = z;
    hitMesh.position.x = x+pixelOffset.x;
    hitMesh.position.y = y+pixelOffset.y;
    hitMesh.rotation.x = 3.14159/2;
    scene.add(hitMesh);
    hitMeshes.push(hitMesh);
    color_values.push(color_value);
    times.push(time);
    hitMesh.hitData = hit;
    hitMesh.t0 = hits[0][8];
  }
  if(hits.length > 0) {
    updateLegend(gui_metadata);
  }
};

function allVisible(meshes) {
  // Set up frustum
  camera.updateMatrix();
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.getInverse(camera.matrixWorld);
  var frustum = new THREE.Frustum();
  frustum.setFromMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  soFarVisible = true;
  var i = 0;
  while(soFarVisible && i < meshes.length) {
    soFarVisible = frustum.containsPoint(meshes[i].position);
    i++;
  }
  return soFarVisible;
};

function notifyIfHidden(hitMeshes) {
  if(allVisible(hitMeshes)) {
    $('#clip-warning').css({'visibility': 'hidden'});
  }
  else {
    $('#clip-warning').css({'visibility': 'visible'});
  }
};

var loadData = function(metadata, data, hitMeshes, adcScale) {
  metadata['data'] = data;
  loadHits(metadata, hitMeshes, adcScale);
  controllerMap['Hit index'].__max = data.length;
  controllerMap['min_index'].__max = data.length;
  controllerMap['max_index'].__max = data.length;
  resetIndexes(metadata, controllerMap);
};

var setUpLegend = function() {
  $('body').append('<div id="legend"></div>');
  legend = $('#legend');
  legend.append('<div id="larpix-title" class="default"></div>');
  legend.append('<div id="event-time" class="default"></div>');
  legend.append('<div id="event-index" class="default"></div>');
  legend.append('<div id="data-file" class="default"></div>');
  legend.append('<div id="clip-warning" class="default"></div>');
  legend.css({
    position: 'absolute',
    bottom: '40px',
    left: '80px',
  });
  $('.default').css({
    'font-size': '14pt',
    'font-family': 'Helvetica, sans-serif',
  });
  $('#larpix-title').text('LArPix').css({
    'font-size': '20pt',
  });
  $('#event-time').text('Time: ');
  $('#event-index').text('Event index range: ');
  $('#data-file').text('Data file: ');
  $('#clip-warning').text('Not all hits are visible')
    .css({
      'color': '#ff0000',
      'visibility': 'hidden',
    });
};

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
  width = window.innerWidth;
  height = window.innerHeight;
  ortho = cameras['orthographic'];
  ortho.left = -width/2;
  ortho.right = width/2;
  ortho.top = height/2;
  ortho.bottom = -height/2;
  ortho.updateProjectionMatrix();
  spriteCamera.left = -width/2;
  spriteCamera.right = width/2;
  spriteCamera.top = height/2;
  spriteCamera.bottom = -height/2;
  spriteCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener('mousemove', onMouseMove, false);
window.addEventListener('mousemove', showHoverHitInfo, false);
function onMouseMove(event) {
  global.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  global.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
};

function checkMouseHoverOver() {
  var camera = cameras['orthographic'];
  var ray = new THREE.Raycaster();
  ray.setFromCamera(global.mouse, camera);

  var intersects = ray.intersectObjects(global.hitMeshes);
  return intersects;
};

function getHitInformation(hitMesh) {
  var hitData = hitMesh.object.hitData;
  var t0 = hitMesh.object.t0;
  var toReturn = '' + (hitData[10] - hitData[11]) + 'mV (' + hitData[7] + 'ADC)';
  return toReturn;
};

function updateTooltipText(text) {
  $('#tooltip').text(text);
};

function showHoverHitInfo(event) {
  if(!global.metadata['Tooltips']) {
    $('#tooltip').css({ visibility: 'hidden' });
    return;
  }
  var intersects = checkMouseHoverOver();
  if(intersects.length > 0) {
    hitMesh = intersects[0];
    text = getHitInformation(hitMesh);
    updateTooltipText(text);
    $('#tooltip').css({
      'bottom': -event.clientY + window.innerHeight + 10,
      'left': event.clientX + 10,
      'font-size': '20pt',
      'visibility': 'visible'
    });
  }
  else {
    $('#tooltip').css({ visibility: 'hidden' });
  }
};

function animate() {
  requestAnimationFrame(animate);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  notifyIfHidden(global.hitMeshes);
  renderer.render(spriteScene, spriteCamera);
};

var global = {};

var main = function() {
  var mouse = new THREE.Vector2();
  global.mouse = mouse;
  var gui = new dat.GUI();
  global.gui = gui;
  var hitMeshes = [];
  global.hitMeshes = hitMeshes;
  var pixelMeshes = [];
  global.pixelMeshes = pixelMeshes;
  var pixelMaterial = new THREE.MeshBasicMaterial({color:0x888888});
  var metadata = {
    'Hit index': 0,
    'min_index': 0,
    'max_index': 1000,
    'Hits displayed': 0, // set programatically from default
    'default_hits_displayed': 1000,
    'Multiplicity cut': 10,
    'Time cut': 200,
    'Z scale': 1000,
    'data': [[]],
    'Next hits': function() {
      loadNextCluster(metadata, hitMeshes, adcScale);
    },
    'Next event': function() {
      loadNextAntiCluster(metadata, hitMeshes, adcScale);
    },
    'shading': true,
    'Cluster help': nextGroupHelp,
    'Anticluster help': nextGapGroupHelp,
    'Data file': '',
    'fileList': [],
    'Reset camera': function() {
      reset_camera(cameras);
    },
    'Tooltips': true,
  };
  metadata['Hits displayed'] = metadata['default_hits_displayed'];
  global.metadata = metadata;
  var gui_colors = {
    'background': '#e7e7e7',
    'active_pixel': '#888888',
    '_background_color': function(x) { scene.background.set(x); },
    '_backup': {},
    'Reset colors': function() {
      for(key in gui_colors._backup) {
        gui_key = key.substr(1);
        gui_colors[gui_key] = gui_colors._backup[key];
        color_key = key + '_color';
        gui_colors[color_key](gui_colors[gui_key]);
      }
    },
    'Night mode': false
  };
  global.gui_colors = gui_colors;
  for(key in gui_colors) {
    if(key[0] == '_') { continue; }
    gui_colors._backup['_' + key] = gui_colors[key];
  }
  var adcScale = setUpColorScale();
  loadFileList(metadata, gui, pixelMeshes, pixelMaterial, hitMeshes, adcScale);
  controllerMap = setUpGUI(metadata, gui, gui_colors, hitMeshes, adcScale, pixelMaterial);
  $('body').append('<div class="default" id="tooltip"></div>');
  $('.default').css({
    'font-size': '14pt',
    'font-family': 'Helvetica, sans-serif',
  });
  tooltip = $('#tooltip');
  tooltip.css({
    position: 'absolute',
    bottom: '140px',
    left: '180px',
    visibility: 'hidden',
    'background-color': 'rgba(150, 150, 150, 0.8)',
    'font-size': '20pt'
  });
  setUpRuler();
  setUpLegend();
  animate(hitMeshes);
};
main();