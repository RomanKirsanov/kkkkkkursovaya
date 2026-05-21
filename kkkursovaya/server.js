const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (roomId, playerName) => {
    socket.join(roomId);
    rooms[roomId] = {
      players: [{ id: socket.id, name: playerName, ready: false }],
      gameStarted: false,
      turn: null,
      boards: {},
      currentRoomId: roomId
    };
    socket.emit('roomCreated', roomId);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', (roomId, playerName) => {
    const room = rooms[roomId];
    if (room && room.players.length < 2 && !room.gameStarted) {
      socket.join(roomId);
      room.players.push({ id: socket.id, name: playerName, ready: false });
      io.to(roomId).emit('updatePlayers', room.players);
      socket.emit('joinSuccess', roomId);
    } else {
      socket.emit('joinError', 'Комната полна или игра уже началась');
    }
  });

  socket.on('playerReady', (roomId, boardData) => {
    const room = rooms[roomId];
    if (!room) return;

    room.boards[socket.id] = boardData;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.ready = true;

    io.to(roomId).emit('updatePlayers', room.players);

    const allReady = room.players.length === 2 && room.players.every(p => p.ready);
    if (allReady && !room.gameStarted) {
      room.gameStarted = true;
      room.turn = room.players[0].id;
      
      const player1Board = room.boards[room.players[0].id];
      const player2Board = room.boards[room.players[1].id];
      
      io.to(room.players[0].id).emit('gameStart', {
        turn: room.turn,
        yourBoard: player1Board,
        enemyBoard: Array(10).fill().map(() => Array(10).fill('unknown'))
      });
      
      io.to(room.players[1].id).emit('gameStart', {
        turn: room.turn,
        yourBoard: player2Board,
        enemyBoard: Array(10).fill().map(() => Array(10).fill('unknown'))
      });
      
      io.to(roomId).emit('updateTurn', room.turn);
    }
  });

  socket.on('makeMove', (roomId, x, y, targetPlayerId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.turn !== socket.id) return;

    const targetBoard = room.boards[targetPlayerId];
    if (!targetBoard) return;

    const cell = targetBoard[y][x];
    let result = 'miss';
    if (cell === 'ship') {
      result = 'hit';
      targetBoard[y][x] = 'hit';
    } else if (cell === 'empty') {
      targetBoard[y][x] = 'miss';
    } else {
      return;
    }

    let allShipsSunk = true;
    for (let row of targetBoard) {
      if (row.includes('ship')) allShipsSunk = false;
    }

    if (allShipsSunk) {
      io.to(roomId).emit('gameOver', socket.id);
      delete rooms[roomId];
      return;
    }

    const nextTurn = room.players.find(p => p.id !== socket.id).id;
    room.turn = nextTurn;

    io.to(socket.id).emit('moveResult', {
      x, y, result, nextTurn,
      hitBoard: targetBoard
    });
    
    io.to(nextTurn).emit('opponentMove', {
      x, y, result
    });
    
    io.to(roomId).emit('updateTurn', nextTurn);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (let roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit('updatePlayers', room.players);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('opponentDisconnected');
        }
        break;
      }
    }
  });
});

// ВАЖНО: слушаем все интерфейсы (0.0.0.0)
const PORT = 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`\n✅ Сервер запущен!`);
  console.log(`📱 Доступен по адресам:`);
  console.log(`   → Локально: http://localhost:${PORT}`);
  
  // Получаем и показываем локальный IP
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name in nets) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168')) {
        console.log(`   → В сети:   http://${net.address}:${PORT}`);
        console.log(`\n📌 Друг должен ввести в браузере: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
});