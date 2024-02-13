const { Server } = require('socket.io');

const PORT = 22222;
const io = new Server(PORT, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
});

var rooms = {};

/*
{
	spyfall: {
		ABCD: {
			id: 'spyfall-ABCD',
			host: socket,
			players: [sockets]
		}
	}
}
*/

io.on('connection', socket =>
{
	socket.on('createRoom', arg =>
	{
		// Missing data
		if (!arg.game || !arg.name) { return; }

		// Create game
		if (!rooms[arg.game])
		{
			rooms[arg.game] = {};
		}

		var code = 'ABCD';

		// Create room
		rooms[arg.game][code] = {
			id: `${arg.game}-${code}`,
			players: []
		};

		arg.code = code;
		joinRoom(socket, arg);
	});

	socket.on('joinRoom', arg => joinRoom(socket, arg));

	socket.on('leaveRoom', () => leaveRoom(socket));

	socket.on('disconnect', () => leaveRoom(socket));

	socket.on('playerRename', arg =>
	{
		if (socket.room)
		{
			socket.name = arg;
			socket.to(socket.room.id).emit('playerRename', { id: socket.id, name: arg });
		}
	});

	// Room host events
	socket.on('send', arg =>
	{
		if (!socket.room) { return; }

		if (socket.host)
		{
			io.to(arg.id).emit('receive', arg);
		}
		else
		{
			arg.id = socket.id;
			io.to(socket.room.host.id).emit('receive', arg);
		}
	});

	socket.on('sendAll', arg =>
	{
		if (!socket.room || !socket.host) { return; }

		socket.to(socket.room.id).emit('receive', arg);
	});

	socket.on('kick', arg =>
	{
		if (!socket.room || !socket.host) { return; }

		var player = io.sockets.sockets.get(arg.id);

		if (player)
		{
			player.emit('kick', arg.msg);
			leaveRoom(player);
		}
	});

	socket.on('chat', arg =>
	{
		if (!socket.room) { return; }

		socket.to(socket.room.id).emit('chat', {id: socket.id, message: arg});
	});
});

function getPlayerList(room)
{
	var playerList = [];

	room.players.forEach(socket =>
	{
		var obj = { id: socket.id, name: socket.name }

		if (socket.host)
		{
			obj.host = true;
		}

		playerList.push(obj);
	});

	return playerList;
}

function joinRoom(socket, arg)
{
	// Missing data
	if (!arg.game || !arg.code || !arg.name) { return; }

	// Invalid game or room
	if (!rooms[arg.game] || !rooms[arg.game][arg.code])
	{
		socket.emit('kicked', 'Invalid room code');
		return;
	}

	// Player already in room
	if (socket.room) { return; }

	var room = rooms[arg.game][arg.code];

	room.players.push(socket);

	socket.name = arg.name;
	socket.room = room;

	if (room.players.length == 1)
	{
		socket.host = true;
		room.host = socket;
	}

	socket.emit('joinedRoom', {
		code: arg.code,
		players: getPlayerList(room)
	});
	socket.join(room.id);
	socket.to(room.id).emit('playerJoin', { id: socket.id, name: socket.name });
}

function leaveRoom(socket)
{
	var room = socket.room;
	if (!room) { return; }

	// Clean up socket
	socket.room = undefined;
	socket.leave(room.id);

	// Broadcast player leaving
	socket.to(room.id).emit('playerLeave', socket.id);

	// Remove from player list
	room.players.splice(room.players.indexOf(socket), 1);

	// Remove room if empty
	if (room.players.length == 0)
	{
		var id = room.id.split('-');
		rooms[id[0]][id[1]] = undefined;
		return;
	}

	// If host left, assign new host
	if (room.host == socket)
	{
		room.host = room.players[0];
		room.host.host = true;
		io.to(room.id).emit('playerHost', room.host.id);
	}
}