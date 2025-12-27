/* global nodes, edges, network, getSpawnPosition, getNormalizedId, wordwrap, unwrap, getColor, getEdgeColor, getEdgeConnecting, getSubPages, colorNodes, edgesWidth, updateNodeValue, startLoading, stopLoading */ // eslint-disable-line max-len
// This script contains the big functions that implement a lot of the core
// functionality, like expanding nodes, and getting the nodes for a traceback.


// -- GLOBAL VARIABLES -- //
window.isReset = true;
window.selectedNode = null;
window.traceedges = [];
window.tracenodes = [];
// ---------------------- //


// Rename a node, possibly merging it with another node if another node has that ID
function renameNode(oldId, newName) {
  const oldNode = nodes.get(oldId);
  const newId = getNormalizedId(newName);
  // The node doesn't need to be renamed
  if (newId === oldId) return oldId;
  // The node needs to be renamed - the new name doesn't exist on the graph yet.
  edges.update([
    // Update all edges that were 'from' oldId to be 'from' newId
    ...edges.get({
      filter: e => e.from === oldId,
    }).map(e => ({ ...e, from: newId })),
    // Update all edges that were 'to' oldId to be 'to' newId
    ...edges.get({
      filter: e => e.to === oldId,
    }).map(e => ({ ...e, to: newId })),
  ]);
  // The node already exists! We're just merging it
  if (nodes.get(newId)) {
    nodes.remove(oldId);
    nodes.update({ id: newId, label: newName });
    console.log(`Merging ${oldId} with ${newId}`);
    // We're actually replacing the node
  } else {
    console.log(`Re-identifying ${oldId} as ${newId}`);
    nodes.remove(oldId);
    nodes.add({ ...oldNode, id: newId, label: wordwrap(newName, oldNode.level === 0 ? 20 : 15) });
  }
  // Update any nodes whose parent was the old node
  nodes.update(
    nodes.get({
      filter: n => n.parent === oldId,
    }).map(n => ({ ...n, parent: newId })),
  );
  // If the old node was highlighted or used as part of a highlight, move the highlight
  if (window.selectedNode === oldId) window.selectedNode = newId;
  window.tracenodes = window.tracenodes.map(id => (id === oldId ? newId : id));
  // If the node was a start node, replace it
  window.startpages = window.startpages.map(id => (id === oldId ? newId : id));
  // Return the new ID
  return newId;
}

// Callback to add to a node once data is recieved
function expandNodeCallback(page, data) {
  const node = nodes.get(page); // The node that was clicked
  const level = node.level + 1; // Level for new nodes is one more than parent
  const subpages = data;

  // Add all children to network
  const subnodes = [];
  const newedges = [];
  // Where new nodes should be spawned
  const [startX, startY] = getSpawnPosition(page);
  
  // Create node objects
  for (let i = 0; i < subpages.length; i += 1) {
    const subpage = subpages[i];
    const subpageID = getNormalizedId(subpage);
    if (!nodes.getIds().includes(subpageID)) { // Don't add if node exists
      
      // Add a small random offset (jitter) to prevent nodes from stacking on top of each other
      const angle = Math.random() * 2 * Math.PI;
      const radius = 5 + Math.random() * 10; // 5-15px jitter
      const spawnX = startX + radius * Math.cos(angle);
      const spawnY = startY + radius * Math.sin(angle);

      subnodes.push({
        id: subpageID,
        label: wordwrap(decodeURIComponent(subpage), 15),
        value: 1,
        level,
        color: getColor(level),
        parent: page,
        x: spawnX,
        y: spawnY,
      });
    }

    if (!getEdgeConnecting(page, subpageID)) { // Don't create duplicate edges in same direction
      newedges.push({
        from: page,
        to: subpageID,
        color: getEdgeColor(level),
        level,
        selectionWidth: 2,
        hoverWidth: 0,
      });
    }
  }

  // Add the new components to the datasets for the graph
  nodes.add(subnodes);
  edges.add(newedges);

  // Update sizes of connected nodes
  updateNodeValue(page);
  subpages.forEach(subpage => updateNodeValue(getNormalizedId(subpage)));
}

// Expand a node without freezing other stuff
function expandNode(id) {
  startLoading(); // Show loading icon
  const pagename = unwrap(nodes.get(id).label);
  getSubPages(pagename).then(({ redirectedTo, links }) => {
    const newId = renameNode(id, redirectedTo);
    expandNodeCallback(newId, links);
    stopLoading(); // Hide loading icon
  }).catch(() => {
    stopLoading(); // Hide on error
  });
  // Mark the expanded node as 'locked' if it's one of the commafield items
  const cf = document.getElementById('input');
  const cfItem = cf.querySelector(`.item[data-node-id="${id}"]`);
  if (cfItem) cfItem.classList.add('locked');
}

// Get all the nodes tracing back to the start node.
function getTraceBackNodes(node) {
  let currentNode = node;
  let finished = false;
  let iterations = 0;
  const path = [];
  while (!finished) { // Add parents of nodes until we reach the start
    path.push(currentNode);
    if (window.startpages.indexOf(currentNode) !== -1) { // Check if we've reached the end
      finished = true;
    }
    currentNode = nodes.get(currentNode).parent; // Keep exploring with the node above.
    // Failsafe: avoid infinite loops in case something got messed up with parents in the graph
    if (iterations > 100) return [];
    iterations += 1;
  }
  return path;
}

// Get all the edges tracing back to the start node.
function getTraceBackEdges(tbnodes) {
  tbnodes.reverse();
  const path = [];
  for (let i = 0; i < tbnodes.length - 1; i += 1) { // Don't iterate through the last node
    path.push(getEdgeConnecting(tbnodes[i], tbnodes[i + 1]));
  }
  return path;
}

// Reset the color of all nodes, and width of all edges.
function resetProperties() {
  if (!window.isReset) {
    window.selectedNode = null;

    // Reset Trace Nodes (Color back to blue based on level)
    const modnodes = window.tracenodes.map(i => nodes.get(i)).filter(n => n !== null);
    if (modnodes.length > 0) colorNodes(modnodes, 0);

    // Reset ALL Nodes Text Opacity
    const allNodes = nodes.get();
    const nodeUpdates = allNodes.map(n => ({
      id: n.id,
      font: { color: 'rgba(0, 0, 0, 1)' } // Restore to full black/dark
    }));
    nodes.update(nodeUpdates);

    // Reset ALL Edges (since we dimmed unrelated ones)
    const allEdges = edges.get();
    const edgeUpdates = allEdges.map(e => ({
      id: e.id,
      width: 1,
      color: getEdgeColor(nodes.get(e.to).level) // Restore original color
    }));
    edges.update(edgeUpdates);

    window.tracenodes = [];
    window.traceedges = [];
    window.isReset = true;
  }
}

// Highlight the path from a given node back to the central node.
function traceBack(node) {
  if (node !== window.selectedNode) {
    resetProperties(); // Reset previous highlights/dimming
    window.selectedNode = node;
    window.isReset = false; // Mark state as modified

    // Calculate Traceback (Yellow Path)
    window.tracenodes = getTraceBackNodes(node);
    window.traceedges = getTraceBackEdges(window.tracenodes);

    // Identify Immediate Connections
    const connectedEdges = network.getConnectedEdges(node);
    const connectedNodes = network.getConnectedNodes(node);

    // Update ALL Edges: Traceback, Neighbors, or Dimmed
    const allEdges = edges.get();
    const edgeUpdates = allEdges.map(e => {
      const isTrace = window.traceedges.includes(e.id);
      const isConnected = connectedEdges.includes(e.id);

      if (isTrace) {
        // Traceback path: Yellow, Thick
        return {
          id: e.id,
          width: 5,
          color: { inherit: 'to' } // Inherits yellow from the target node
        };
      } else if (isConnected) {
        // Immediate neighbor: Bold (Blue/Normal color)
        return {
          id: e.id,
          width: 3, 
          color: getEdgeColor(nodes.get(e.to).level) // Standard color, just bold
        };
      } else {
        // Unrelated: Dimmed (Transparent Grey, 0.05 opacity)
        return {
          id: e.id,
          width: 1,
          color: 'rgba(122, 206, 247, 0.4)' 
        };
      }
    });
    edges.update(edgeUpdates);

    // Update ALL Nodes: Active ones opaque, others dimmed text
    const allNodeIds = nodes.getIds();
    const nodeUpdates = allNodeIds.map(id => {
      // Active if: Selected, Traceback, or Neighbor
      const isActive = (id === node) || window.tracenodes.includes(id) || connectedNodes.includes(id);
      return {
        id: id,
        font: { color: isActive ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.3)' }
      };
    });
    nodes.update(nodeUpdates);

    // Color trace nodes yellow
    const modnodes = window.tracenodes.map(i => nodes.get(i));
    colorNodes(modnodes, 1);
  }
}
