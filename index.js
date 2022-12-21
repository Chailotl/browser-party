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

	socket.on('joinRoom', arg =>
	{
		joinRoom(socket, arg);
	});

	socket.on('leaveRoom', () =>
	{
		leaveRoom(socket);
	});

	socket.on('playerRename', arg =>
	{
		if (socket.room)
		{
			socket.name = arg;
			socket.to(socket.room.id).emit('playerRename', { id: socket.id, name: arg });
		}
	});

	socket.on('send', arg =>
	{
		if (!socket.room) { return; }

		if (socket.host)
		{
			io.to(arg.id).emit('data', arg.data);
		}
		else
		{
			io.to(socket.room.host.id).emit('data', arg.data);
		}
	});

	socket.on('broadcast', arg =>
	{
		if (!socket.room || !socket.host) { return; }

		socket.to(socket.room.id).emit('data', arg);
	});

	socket.on('chat', arg =>
	{
		if (!socket.room) { return; }

		socket.to(socket.room.id).emit('chat', socket.name + ': ' + arg);
	});

	socket.on('disconnect', () =>
	{
		leaveRoom(socket);
	})
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
		socket.emit('deniedRoom', 'Invalid room code');
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
	if (!socket.room) { return; }

	// Broadcast player leaving
	socket.to(socket.room.id).emit('playerLeave', socket.id);
	socket.leave(socket.room.id);

	// Remove from player list
	socket.room.players.splice(socket.room.players.indexOf(socket), 1);

	// Remove room if empty
	if (socket.room.players.length == 0)
	{
		var id = socket.room.id.split('-');
		rooms[id[0]][id[1]] = undefined;
	}

	// Clean up socket
	socket.room = undefined;
}