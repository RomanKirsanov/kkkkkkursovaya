const socket = io();

let currentRoom = null;
let myId = null;
let myBoard = Array(10).fill().map(() => Array(10).fill('empty'));
let enemyBoard = Array(10).fill().map(() => Array(10).fill('unknown'));
let gameActive = false;
let myTurn = false;
let enemyPlayerId = null;
let placementMode = true;

// Данные для ручной расстановки
let shipsToPlace = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
let currentShipIndex = 0;
let currentShipSize = 4;
let isHorizontal = true;

// Элементы DOM
const menuDiv = document.getElementById('menu');
const roomInfoDiv = document.getElementById('roomInfo');
const gameViewDiv = document.getElementById('gameView');
const placementPanel = document.getElementById('placementPanel');
const myBoardGrid = document.getElementById('myBoardGrid');
const enemyBoardGrid = document.getElementById('enemyBoardGrid');
const playersList = document.getElementById('playersList');
const turnInfo = document.getElementById('turnInfo');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const shipsListDiv = document.getElementById('shipsList');

// Функция для обводки уничтоженного корабля
function markSunkShip(board, hitX, hitY) {
  // Находим все клетки корабля (связанные попадания)
  let shipCells = [];
  let queue = [{x: hitX, y: hitY}];
  let visited = new Set();
  
  while (queue.length > 0) {
    let {x, y} = queue.shift();
    let key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    
    if (board[y][x] === 'hit') {
      shipCells.push({x, y});
      // Проверяем соседние клетки
      let neighbors = [
        {x: x+1, y: y}, {x: x-1, y: y},
        {x: x, y: y+1}, {x: x, y: y-1}
      ];
      for (let n of neighbors) {
        if (n.x >= 0 && n.x < 10 && n.y >= 0 && n.y < 10 && board[n.y][n.x] === 'hit') {
          queue.push(n);
        }
      }
    }
  }
  
  if (shipCells.length === 0) return false;
  
  let minX = Math.min(...shipCells.map(c => c.x));
  let maxX = Math.max(...shipCells.map(c => c.x));
  let minY = Math.min(...shipCells.map(c => c.y));
  let maxY = Math.max(...shipCells.map(c => c.y));
  
  let isHorizontalShip = (maxX - minX) > (maxY - minY);
  
  let allHit = true;
  if (isHorizontalShip) {
    for (let x = minX; x <= maxX; x++) {
      if (board[minY][x] !== 'hit') allHit = false;
    }
  } else {
    for (let y = minY; y <= maxY; y++) {
      if (board[y][minX] !== 'hit') allHit = false;
    }
  }
  
  if (!allHit) return false;
  
  // Обводим корабль (ставим miss вокруг)
  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      if (x >= 0 && x < 10 && y >= 0 && y < 10) {
        if (board[y][x] === 'empty') {
          board[y][x] = 'miss';
        }
      }
    }
  }
  
  return true;
}

function hasRemainingShips(board) {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (board[y][x] === 'ship') {
        return true;
      }
    }
  }
  return false;
}

function isNearbyShips(board, x, y, size, horizontal) {
  for (let i = -1; i <= size; i++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let checkX, checkY;
        
        if (horizontal) {
          checkX = x + i;
          checkY = y + dy;
        } else {
          checkX = x + dx;
          checkY = y + i;
        }
        
        if (horizontal && i >= 0 && i < size && dy === 0) continue;
        if (!horizontal && i >= 0 && i < size && dx === 0) continue;
        
        if (checkX >= 0 && checkX < 10 && checkY >= 0 && checkY < 10) {
          if (board[checkY][checkX] === 'ship') {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function canPlaceShip(board, x, y, size, horizontal) {
  if (horizontal) {
    if (x + size > 10) return false;
    for (let i = 0; i < size; i++) {
      if (board[y][x + i] !== 'empty') return false;
    }
  } else {
    if (y + size > 10) return false;
    for (let i = 0; i < size; i++) {
      if (board[y + i][x] !== 'empty') return false;
    }
  }
  
  return isNearbyShips(board, x, y, size, horizontal);
}

function placeShip(board, x, y, size, horizontal) {
  if (!canPlaceShip(board, x, y, size, horizontal)) return false;
  
  for (let i = 0; i < size; i++) {
    if (horizontal) {
      board[y][x + i] = 'ship';
    } else {
      board[y + i][x] = 'ship';
    }
  }
  return true;
}

function handleCellClick(x, y) {
  if (!placementMode) return;
  if (currentShipSize === undefined || currentShipSize === 0) {
    alert('Все корабли уже расставлены!');
    return;
  }
  
  if (placeShip(myBoard, x, y, currentShipSize, isHorizontal)) {
    shipsToPlace[currentShipIndex] = 0;
    currentShipIndex = shipsToPlace.findIndex(size => size > 0);
    if (currentShipIndex === -1) {
      currentShipSize = 0;
      alert('Все корабли расставлены! Нажмите "Готов к бою"');
    } else {
      currentShipSize = shipsToPlace[currentShipIndex];
    }
    renderShipsList();
    renderMyBoard();
  } else {
    alert('Нельзя поставить корабль здесь!\nПроверьте:\n- Корабли не должны касаться друг друга\n- Нужно место для корабля\n- Корабли не должны выходить за поле');
  }
}

function randomPlacement() {
  myBoard = Array(10).fill().map(() => Array(10).fill('empty'));
  const ships = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  
  for (let size of ships) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      const horizontal = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horizontal ? 10 - size + 1 : 10));
      const y = Math.floor(Math.random() * (horizontal ? 10 : 10 - size + 1));
      
      if (canPlaceShip(myBoard, x, y, size, horizontal)) {
        placeShip(myBoard, x, y, size, horizontal);
        placed = true;
      }
      attempts++;
    }
  }
  
  shipsToPlace = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  currentShipSize = 0;
  renderShipsList();
  renderMyBoard();
  alert('Корабли расставлены случайным образом!');
}

function clearBoard() {
  myBoard = Array(10).fill().map(() => Array(10).fill('empty'));
  shipsToPlace = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  currentShipIndex = 0;
  currentShipSize = 4;
  renderShipsList();
  renderMyBoard();
}

function renderShipsList() {
  if (!shipsListDiv) return;
  shipsListDiv.innerHTML = '';
  shipsToPlace.forEach((size, index) => {
    const shipDiv = document.createElement('div');
    shipDiv.className = 'ship-btn';
    if (index === currentShipIndex && size > 0) shipDiv.classList.add('active');
    if (size === 0) shipDiv.classList.add('placed');
    const shipName = size === 4 ? 'Линкор (4)' : size === 3 ? 'Крейсер (3)' : size === 2 ? 'Эсминец (2)' : 'Катер (1)';
    shipDiv.innerHTML = shipName;
    if (size > 0) {
      shipDiv.onclick = () => selectShip(index);
    }
    shipsListDiv.appendChild(shipDiv);
  });
  
  const orientationBtn = document.createElement('button');
  orientationBtn.textContent = isHorizontal ? ' Горизонтально' : ' Вертикально';
  orientationBtn.onclick = () => {
    isHorizontal = !isHorizontal;
    orientationBtn.textContent = isHorizontal ? ' Горизонтально' : ' Вертикально';
  };
  orientationBtn.style.marginLeft = '10px';
  orientationBtn.style.background = '#2196f3';
  shipsListDiv.appendChild(orientationBtn);
}

function selectShip(index) {
  if (shipsToPlace[index] === 0) return;
  currentShipIndex = index;
  currentShipSize = shipsToPlace[index];
  renderShipsList();
}

function renderMyBoard() {
  if (!myBoardGrid) return;
  myBoardGrid.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const val = myBoard[y][x];
      if (val === 'ship') cell.classList.add('ship');
      else if (val === 'hit') cell.classList.add('hit');
      else if (val === 'miss') cell.classList.add('miss');
      else cell.classList.add('empty');
      
      if (placementMode && val === 'empty') {
        cell.style.cursor = 'pointer';
        cell.onclick = (function(xx, yy) { return () => handleCellClick(xx, yy); })(x, y);
      }
      
      myBoardGrid.appendChild(cell);
    }
  }
}

function renderEnemyBoard() {
  if (!enemyBoardGrid) return;
  enemyBoardGrid.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const val = enemyBoard[y][x];
      if (val === 'hit') {
        cell.classList.add('hit');
      } else if (val === 'miss') {
        cell.classList.add('miss');
      } else if (val === 'unknown') {
        cell.classList.add('empty');
      }
      
      if (gameActive && myTurn && val === 'unknown') {
        cell.style.cursor = 'pointer';
        cell.onclick = (function(xx, yy) { return () => makeMove(xx, yy); })(x, y);
      } else {
        cell.style.cursor = 'not-allowed';
      }
      
      enemyBoardGrid.appendChild(cell);
    }
  }
}

function makeMove(x, y) {
  if (!gameActive || !myTurn || enemyBoard[y][x] !== 'unknown') return;
  socket.emit('makeMove', currentRoom, x, y, enemyPlayerId);
}

function startGameUI(data) {
  gameActive = true;
  placementMode = false;
  if (placementPanel) placementPanel.style.display = 'none';
  myBoard = data.yourBoard;
  enemyBoard = data.enemyBoard;
  myTurn = (data.turn === myId);
  renderMyBoard();
  renderEnemyBoard();
  updateTurnDisplay();
}

function updateTurnDisplay() {
  if (!turnInfo) return;
  if (!gameActive) {
    turnInfo.innerText = 'Ожидание начала игры...';
  } else {
    turnInfo.innerText = myTurn ? ' ВАШ ХОД! Стреляйте по полю противника ' : ' ХОД ПРОТИВНИКА... Ожидайте ';
  }
}

function readyToPlay() {
  if (currentRoom && shipsToPlace.every(size => size === 0)) {
    socket.emit('playerReady', currentRoom, myBoard);
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) {
      readyBtn.disabled = true;
      readyBtn.textContent = '✓ Ожидание соперника...';
    }
  } else {
    const remaining = shipsToPlace.filter(s => s > 0).length;
    alert(`Расставьте все корабли! Осталось: ${remaining} корабль(ей)`);
  }
}

function createRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Игрок';
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  socket.emit('createRoom', roomId, name);
  currentRoom = roomId;
  if (roomIdDisplay) roomIdDisplay.innerText = roomId;
  switchToGame();
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Игрок';
  const roomId = document.getElementById('roomIdInput').value.trim();
  if (!roomId) {
    alert('Введите ID комнаты');
    return;
  }
  socket.emit('joinRoom', roomId, name);
  currentRoom = roomId;
  if (roomIdDisplay) roomIdDisplay.innerText = roomId;
  switchToGame();
}

function switchToGame() {
  if (menuDiv) menuDiv.style.display = 'none';
  if (roomInfoDiv) roomInfoDiv.style.display = 'block';
  if (gameViewDiv) gameViewDiv.style.display = 'block';
  randomPlacement();
}

// Socket события
socket.on('roomCreated', (roomId) => {
  console.log('Комната создана:', roomId);
});

socket.on('joinSuccess', (roomId) => {
  console.log('Подключились к комнате:', roomId);
});

socket.on('joinError', (msg) => {
  alert(msg);
  location.reload();
});

socket.on('updatePlayers', (players) => {
  if (!playersList) return;
  const list = players.map(p => `${p.name} ${p.ready ? '' : ''}`).join(' vs ');
  playersList.innerHTML = `Игроки: ${list}`;
  myId = players.find(p => p.id === socket.id)?.id;
  if (players.length === 2) {
    enemyPlayerId = players.find(p => p.id !== myId)?.id;
  }
});

socket.on('gameStart', (data) => {
  startGameUI(data);
});

socket.on('updateTurn', (turnId) => {
  myTurn = (turnId === myId);
  updateTurnDisplay();
  renderEnemyBoard();
});

socket.on('moveResult', (data) => {
  if (data.result === 'hit') {
    enemyBoard[data.y][data.x] = 'hit';
    
    let shipDestroyed = markSunkShip(enemyBoard, data.x, data.y);
    
    if (shipDestroyed) {
      renderEnemyBoard();
      
      let allShipsSunk = !hasRemainingShips(enemyBoard);
      if (allShipsSunk) {
        return;
      }
      
      if (turnInfo) turnInfo.innerText = ' ПОПАЛ!';
      setTimeout(() => updateTurnDisplay(), 1000);
      renderEnemyBoard();
      return;
    }
    
    myTurn = true;
    updateTurnDisplay();
    renderEnemyBoard();
  } else {
    enemyBoard[data.y][data.x] = 'miss';
    myTurn = (data.nextTurn === myId);
    renderEnemyBoard();
    updateTurnDisplay();
  }
});

socket.on('opponentMove', (data) => {
  if (data.result === 'hit') {
    myBoard[data.y][data.x] = 'hit';
    markSunkShip(myBoard, data.x, data.y);
  } else {
    myBoard[data.y][data.x] = 'miss';
  }
  renderMyBoard();
});

socket.on('gameOver', (winnerId) => {
  const isWinner = (winnerId === myId);
  alert(isWinner ? ' ПОБЕДА! \nВы уничтожили все корабли противника!' : ' ПОРАЖЕНИЕ \nВаши корабли уничтожены...');
  setTimeout(() => location.reload(), 2000);
});

socket.on('opponentDisconnected', () => {
  alert('Соперник отключился! Игра завершена.');
  location.reload();
});

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  renderShipsList();
  renderMyBoard();
  
  const createBtn = document.getElementById('createRoomBtn');
  const joinBtn = document.getElementById('joinRoomBtn');
  const randomBtn = document.getElementById('randomPlaceBtn');
  const clearBtn = document.getElementById('clearBoardBtn');
  const readyBtn = document.getElementById('readyBtn');
  
  if (createBtn) createBtn.onclick = createRoom;
  if (joinBtn) joinBtn.onclick = joinRoom;
  if (randomBtn) randomBtn.onclick = randomPlacement;
  if (clearBtn) clearBtn.onclick = clearBoard;
  if (readyBtn) readyBtn.onclick = readyToPlay;
});
