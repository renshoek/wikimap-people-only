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
    // CASE 2: No selection -> Pick Random and Select it (Don't open yet)
    selectRandomNode();
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
  const allSuggestions = [
    // Science & Tech
    "Physics", "Chemistry", "Biology", "Quantum mechanics", "General relativity", "Evolution", "DNA", "Atom", 
    "Black hole", "Big Bang", "Periodic table", "Photosynthesis", "Gravity", "Electricity", "Magnetism", 
    "Thermodynamics", "Plate tectonics", "Climate change", "Artificial intelligence", "Internet", "World Wide Web", 
    "Computer", "Smartphone", "Blockchain", "Cryptography", "Virtual reality", "3D printing", "Robot", "Nanotechnology", 
    "Nuclear power", "Space exploration", "Mars rover", "Hubble Space Telescope", "International Space Station", 
    "GPS", "Bluetooth", "Wi-Fi", "Transistor", "Solar system", "Moon", "Mars", "Jupiter", "Saturn", "Pluto", 
    "Milky Way", "Andromeda Galaxy", "Nebula", "Supernova", "Comet", "Asteroid", "Exoplanet", "Dark matter",
    
    // History & People
    "World War I", "World War II", "Roman Empire", "Ancient Egypt", "Alexander the Great", "Genghis Khan", "Napoleon", 
    "Industrial Revolution", "French Revolution", "Cold War", "Apollo 11", "Titanic", "Black Death", "Renaissance", 
    "Viking Age", "Ottoman Empire", "Aztec Empire", "Maya civilization", "Julius Caesar", "Cleopatra", "Albert Einstein", 
    "Isaac Newton", "Charles Darwin", "Nikola Tesla", "Marie Curie", "Galileo Galilei", "Stephen Hawking", "Alan Turing", 
    "Ada Lovelace", "Steve Jobs", "Bill Gates", "Elon Musk", "Martin Luther King Jr.", "Nelson Mandela", "Mahatma Gandhi", 
    "Winston Churchill", "Abraham Lincoln", "George Washington", "Queen Victoria", "Elizabeth II", "Barack Obama", 
    "Leonardo da Vinci", "Michelangelo", "Pablo Picasso", "Mozart", "Beethoven", "Shakespeare", "Plato", "Aristotle", "Socrates",

    // Culture, Arts & Entertainment
    "Mona Lisa", "Starry Night", "The Beatles", "Hip hop", "Jazz", "Rock and roll", "Anime", "Manga", "Harry Potter", 
    "Star Wars", "Lord of the Rings", "Game of Thrones", "Marvel Cinematic Universe", "The Matrix", "The Godfather", 
    "Pulp Fiction", "The Shawshank Redemption", "Schindler's List", "Forrest Gump", "Inception", "The Dark Knight", 
    "Spirited Away", "Parasite", "Avatar", "Jurassic Park", "Jaws", "E.T.", "The Lion King", "Toy Story", "Frozen", 
    "Minecraft", "Tetris", "Super Mario", "The Legend of Zelda", "Pokémon", "Grand Theft Auto", "Fortnite", "Pac-Man",
    
    // Nature & Geography
    "Mount Everest", "Amazon Rainforest", "Sahara", "Antarctica", "Great Barrier Reef", "Grand Canyon", "Mariana Trench", 
    "Nile", "Amazon River", "Himalayas", "Andes", "Alps", "Mediterranean Sea", "Pacific Ocean", "Atlantic Ocean", 
    "Dead Sea", "Galapagos Islands", "Yellowstone National Park", "Machu Picchu", "Petra", "Lion", "Tiger", "Elephant", 
    "Blue whale", "Dolphin", "Shark", "Eagle", "Penguin", "Octopus", "Spider", "Ant", "Bee", "Butterfly", "Dinosaur", 
    "Tyrannosaurus", "Woolly mammoth", "Rose", "Oak", "Fungus", "Bacteria",
    
    // Places
    "New York City", "London", "Paris", "Tokyo", "Rome", "Jerusalem", "Istanbul", "Beijing", "Moscow", "Sydney", 
    "Rio de Janeiro", "Cairo", "Dubai", "Singapore", "Hong Kong", "United States", "China", "India", "Brazil", "Australia",
    "Canada", "Japan", "Germany", "France", "Italy", "Spain", "Russia", "Mexico", "Egypt", "South Africa",
    
    // Concepts & Misc
    "Philosophy", "Stoicism", "Nihilism", "Existentialism", "Ethics", "Logic", "Metaphysics", "Epistemology", 
    "Consciousness", "Free will", "Happiness", "Love", "Time", "Mathematics", "Infinity", "Pi", "Golden ratio", 
    "Fractal", "Game theory", "Paradox", "Democracy", "Capitalism", "Socialism", "Communism", "Feminism", 
    "Environmentalism", "Psychology", "Dream", "Sleep", "Brain", "Heart", "Eye", "Color", "Light", "Sound", "Music",
    "Chess", "Soccer", "Basketball", "Olympics", "Nobel Prize", "United Nations", "Human rights", "Coffee", "Tea", 
    "Chocolate", "Pizza", "Sushi", "Beer", "Wine", "Cheese", "Bread", "Rice", "Potato",

    // Niche, Weird & Interesting
    "Voynich manuscript", "Antikythera mechanism", "Göbekli Tepe", "Emu War", "Dancing Plague of 1518", 
    "Defenestration of Prague", "Great Molasses Flood", "Tanganyika laughter epidemic", "Mary Celeste", "Dyatlov Pass incident",
    "Tunguska event", "Wow! signal", "Bloop", "Cicada 3301", "Toynbee tiles", "Polybius (urban legend)", 
    "Max Headroom signal hijacking", "D. B. Cooper", "Tarrare", "Phineas Gage", "Emperor Norton", "Mike the Headless Chicken",
    "Unsinkable Sam", "Wojtek (bear)", "Sergeant Stubby", "Hachikō", "Balto", "Laika", "Ham (chimpanzee)", "Dolly (sheep)",
    "Ship of Theseus", "Brain in a vat", "Boltzmann brain", "Roko's basilisk", "Omphalos hypothesis", "Last Thursdayism",
    "Russell's teapot", "Invisible Pink Unicorn", "Flying Spaghetti Monster", "Jedi census phenomenon", "Pastafarianism",
    "Discordianism", "Church of the SubGenius", "Time Cube", "TempleOS", "Library of Babel", "Dead Internet theory",
    "Phantom time hypothesis", "List of sexually active popes", "Toilet paper orientation"
  ];
  
  const container = document.getElementById('suggestions');
  const cf = document.getElementById('input'); // The commafield input

  // Function to shuffle and render 20 random topics
  function renderSuggestions() {
    // Clear existing
    container.innerHTML = '';
    
    // Randomize array using Fisher-Yates shuffle (or simple sort for brevity)
    const shuffled = [...allSuggestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 20);
    
    selected.forEach(topic => {
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

  // Initial Render
  renderSuggestions();

  // Bind Refresh Button
  const refreshBtn = document.getElementById('refresh-suggestions');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Add a rotation class to animate (optional, needs CSS) or just re-render
      refreshBtn.style.transition = "transform 0.3s";
      refreshBtn.style.transform = `rotate(${Math.random() * 360}deg)`;
      renderSuggestions();
    });
  }
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
