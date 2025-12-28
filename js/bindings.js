/* global nodes, network, isTouchDevice, shepherd, updateNodeValue */
/* global expandNode, traceBack, resetProperties, go, goRandom, clearNetwork, unwrap, addItem */
// This script contains (most of) the code that binds actions to events.

let lastClickedNode = null;

// Functions that will be used as bindings
function expandEvent(params) { // Expand a node (with event handler)
  if (params.nodes.length) { // Did the click occur on a node?
    const page = params.nodes[0]; // The id of the node clicked

    // On touch devices, 'hold' triggers this, so we expand immediately.
    // On desktop, we require a second click on the selected node.
    // Double-click triggers this logic effectively skipping the 'second click' wait because page === lastClickedNode
    if (isTouchDevice || page === lastClickedNode) {
      expandNode(page);
    } else {
      lastClickedNode = page;
      traceBack(page);
    }
  } else {
    lastClickedNode = null;
    resetProperties();
  }
}

function mobileTraceEvent(params) { // Trace back a node (with event handler)
  if (params.nodes.length) { // Was the click on a node?
    // The node clicked
    const page = params.nodes[0];
    
    // UPDATE: Keep lastClickedNode in sync on mobile too
    lastClickedNode = page;
    
    // Highlight in blue all nodes tracing back to central node
    traceBack(page);
  } else {
    lastClickedNode = null;
    resetProperties();
  }
}

// Helper to open a page by ID
function openPageForId(nodeId) {
  if (nodeId && nodes.get(nodeId)) {
    const page = encodeURIComponent(unwrap(nodes.get(nodeId).label));
    // UPDATE: Use HTTPS to prevent mixed content errors
    const url = `https://en.wikipedia.org/wiki/${page}`;
    window.open(url, '_blank');
  }
}

// Helper: Zoom to a specific node (Used by the Find button)
function zoomToNode(nodeId) {
  network.focus(nodeId, {
    scale: 1.0,
    animation: {
      duration: 1000,
      easingFunction: "easeInOutQuad"
    }
  });
}

// Helper: Pick Random, Select it, Zoom to it
function selectAndZoomRandomNode() {
  const allIds = nodes.getIds();
  if (allIds.length > 0) {
    // Pick random ID
    const randomNodeId = allIds[Math.floor(Math.random() * allIds.length)];
    
    // Update global state
    lastClickedNode = randomNodeId;
    
    // Select it visually (highlight yellow path)
    traceBack(randomNodeId);
    
    // Zoom camera to it
    zoomToNode(randomNodeId);
  }
}

// NEW Helper: Pick Random and Select it (BUT DO NOT ZOOM)
function selectRandomNode() {
  const allIds = nodes.getIds();
  if (allIds.length > 0) {
    const randomNodeId = allIds[Math.floor(Math.random() * allIds.length)];
    lastClickedNode = randomNodeId;
    traceBack(randomNodeId);
    return randomNodeId;
  }
  return null;
}

// NEW Helper: Open selected node, OR pick random (No Zoom)
function openActiveOrRandomNode() {
  // Check if we currently have a selection
  const targetNode = window.selectedNode || lastClickedNode;

  if (targetNode) {
    // CASE 1: A node is already selected -> Just Open it (No Zoom)
    openPageForId(targetNode);
  } else {
    // CASE 2: No selection -> Pick Random, Select, Open (No Zoom)
    const randId = selectRandomNode();
    if (randId) {
      openPageForId(randId);
    }
  }
}

// Event handler for 't' key press
function keyOpenPageEvent(e) {
  // Ignore if typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 't' || e.key === 'T') {
    openActiveOrRandomNode();
  }
}

// Retained for double-click binding if needed, though we are switching double-click to expand
function openPageEvent(params) {
  if (params.nodes.length) {
    openPageForId(params.nodes[0]);
  }
}

function removeNodeEvent(params) {
  // Get the node under the mouse cursor using the pointer coordinates
  const nodeId = network.getNodeAt(params.pointer.DOM);
  if (nodeId) {
    // CHANGED: Always reset properties if the graph is in a modified state.
    // This prevents "stale" highlights/edges from persisting after a node is removed,
    // which was causing the interface to get stuck.
    if (!window.isReset) {
      resetProperties();
    }

    // Get neighbors before removing the node so we can update them later
    const neighbors = network.getConnectedNodes(nodeId);

    nodes.remove(nodeId);
    // If we removed the node we were just about to expand, clear the state
    if (lastClickedNode === nodeId) {
      lastClickedNode = null;
    }

    // Update the size of the neighbors because they lost a connection
    neighbors.forEach(neighborId => updateNodeValue(neighborId));
  }
}

// Bind the network events
function bindNetwork() {
  if (isTouchDevice) { // Device has touchscreen
    network.on('hold', expandEvent); // Long press to expand
    network.on('click', mobileTraceEvent); // Highlight traceback on click
  } else { // Device does not have touchscreen
    network.on('click', expandEvent); // Expand on click
    network.on('hoverNode', params => traceBack(params.node)); // Highlight traceback on hover
    
    // Logic to persist selection on blur
    network.on('blurNode', () => {
      if (lastClickedNode) {
        // If a node is currently selected (clicked), revert highlight to it
        traceBack(lastClickedNode);
      } else {
        // Otherwise reset to normal
        resetProperties();
      }
    });
  }

  // Bind double-click to expandEvent instead of openPageEvent
  network.on('doubleClick', expandEvent);

  // Bind right-click to remove node
  network.on('oncontext', removeNodeEvent);
}

// --- NEW FUNCTION: Bind Suggestions ---
function bindSuggestions() {
  const suggestions = [
    "Barack Obama", "The Beatles", "World War II", "Artificial Intelligence", "Mona Lisa",
    "Mount Everest", "Leonardo da Vinci", "United States", "Google", "Minecraft",
    "Psychology", "Black Hole", "Nelson Mandela", "The Moon", "Coffee",
    "JavaScript", "Ancient Egypt", "Batman", "Albert Einstein", "DNA"
  ];
  
  const container = document.getElementById('suggestions');
  const cf = document.getElementById('input'); // The commafield input

  suggestions.forEach(topic => {
    const el = document.createElement('div');
    el.className = 'suggestion-item';
    el.textContent = topic;
    
    el.addEventListener('click', () => {
      if (!el.classList.contains('disabled')) {
        // Add to commafield
        addItem(cf, topic);
        // Grey out
        el.classList.add('disabled');
      }
    });
    
    container.appendChild(el);
  });
}

function bind() {
  // Initialize suggested topics
  bindSuggestions();

  // Prevent iOS scrolling
  document.addEventListener('touchmove', e => e.preventDefault());

  // Prevent default context menu to allow right-click to remove nodes
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Bind key listener for 't' to open Wikipedia page
  document.addEventListener('keydown', keyOpenPageEvent);

  // Bind actions for search component.

  const cf = document.querySelector('.commafield');
  // Bind go button press
  const submitButton = document.getElementById('submit');
  submitButton.addEventListener('click', () => {
    shepherd.cancel(); // Dismiss the tour if it is in progress
    go();
  });

  const randomButton = document.getElementById('random');
  randomButton.addEventListener('click', goRandom);

  const clearButton = document.getElementById('clear');
  clearButton.addEventListener('click', clearNetwork);

  // Bind tour start (from the Welcome Screen only)
  const tourbtn = document.getElementById('tourinit');
  if (tourbtn) {
    tourbtn.addEventListener('click', () => shepherd.start());
  }

  // Bind Remove Selected Node button (Mobile Friendly)
  const removeSelectedButton = document.getElementById('remove-selected');
  if (removeSelectedButton) {
    removeSelectedButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop click from bubbling to network
      // Use window.selectedNode (mobile/active hover) OR lastClickedNode (desktop selection)
      // This ensures functionality even if the node was blurred (deselected) by moving the mouse to the button.
      const nodeToRemove = window.selectedNode || lastClickedNode;
      if (nodeToRemove) {
        // Get neighbors before removing
        const neighbors = network.getConnectedNodes(nodeToRemove);

        // Reset properties BEFORE removing the node to avoid accessing a removed node in resetProperties
        resetProperties(); 
        nodes.remove(nodeToRemove);
        window.selectedNode = null;
        lastClickedNode = null;

        // Update the size of the neighbors
        neighbors.forEach(neighborId => updateNodeValue(neighborId));
      }
    });
  }

  // Bind Zoom & Select Random Node button
  // MODIFIED: Zoom to active node if exists, else select/zoom random
  const zoomRandomButton = document.getElementById('zoom-select-random');
  if (zoomRandomButton) {
    zoomRandomButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetNode = window.selectedNode || lastClickedNode;
      if (targetNode) {
        zoomToNode(targetNode);
      } else {
        selectAndZoomRandomNode();
      }
    });
  }

  // Bind Expand Button (Modified: NO ZOOM)
  const expandRandomButton = document.getElementById('expand-random');
  if (expandRandomButton) {
    expandRandomButton.addEventListener('click', (e) => {
      e.stopPropagation();

      // Check if there is a selected node
      const targetNode = window.selectedNode || lastClickedNode;

      if (targetNode) {
        // OPTION A: Expand the selected node (NO ZOOM)
        expandNode(targetNode);
      } else {
        // OPTION B: No selection -> Select random node (BUT DO NOT EXPAND, NO ZOOM)
        selectRandomNode();
      }
    });
  }

  // Bind Open Wikipedia button (Modified: NO ZOOM)
  const openWikiButton = document.getElementById('open-wikipedia');
  if (openWikiButton) {
    openWikiButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent click from bubbling
      openActiveOrRandomNode();
    });
  }
}
