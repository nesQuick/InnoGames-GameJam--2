var game  = {
	roles: {
		ATTACKER: 'attacker',
		DEFENDER: 'defender',
		VISITOR: 'visitor'
	},
	users: {
		attacker: null,
		defender: null,
		visitor: []
	},
	states: {
		WAITING_FOR_PLAYERS: 'waiting_for_players',
		WAITING_FOR_DEFENDER: 'waiting_for_defender',
		FIRST_ROUND: 'first_round',
		BACK_ROUND: 'back_round',
		ATTACKER_WIN: 'attacker_win',
		ATTACKER_LOST: 'attacker_lost'
	},
	state: null,
	attacker_pos: {x: 43, y: 43},
	projectiles: [],
	units: [],
	unit_count: 1,
	viewport_w: 1400,
	viewport_h: 600
};

game.state = game.states.WAITING_FOR_PLAYERS;

function cleanupRoles() {
	if (game.users.attacker && game.users.attacker.disconnected) {
		game.users.attacker = null;
		game.state = game.states.WAITING_FOR_PLAYERS
	}
	if (game.users.defender && game.users.defender.disconnected) {
		game.users.defender = null;
		game.state = game.states.WAITING_FOR_DEFENDER
	}
}

function broadcastAttackerPos() {
	if (game.users.attacker) {
		game.users[game.roles.ATTACKER].broadcast.emit('update_attacker_pos', game.attacker_pos);
	}
}

function broadcastProjectileDestroy(projectile) {
	if (game.users.attacker) {
		game.users[game.roles.ATTACKER].broadcast.emit('projectile_destroyed', projectile);
		game.users[game.roles.ATTACKER].emit('projectile_destroyed', projectile);
	}
}

function broadcastProjectilesPos() {
	for (var i in game.projectiles) {
		var projectile = game.projectiles[i];
		projectile.x += 15;

		if (projectile.x > game.viewport_w) {
			broadcastProjectileDestroy(projectile);
			game.projectiles.splice(i, 1);
			continue;
		}

		if (game.users.attacker) {
			game.users[game.roles.ATTACKER].broadcast.emit('update_projectile_pos', projectile);
			game.users[game.roles.ATTACKER].emit('update_projectile_pos', projectile);
		}
	}
}

function changeGameState(socket, state) {
	game.state = state;
	socket.emit('state_change', state);
	socket.broadcast.emit('state_change', state);
}

exports.events = function (socket) {
	cleanupRoles();

	if (!game.users[game.roles.ATTACKER]) {
		game.users[game.roles.ATTACKER] = socket;
		changeGameState(socket, game.states.WAITING_FOR_DEFENDER)
		socket.emit('role_update', {
			role: game.roles.ATTACKER
		})
	} else if (!game.users[game.roles.DEFENDER]) {
		game.users[game.roles.DEFENDER] = socket;
		changeGameState(socket, game.states.FIRST_ROUND)
		socket.emit('role_update', {
			role: game.roles.DEFENDER
		})
	} else {
		game.users[game.roles.VISITOR].push(socket);
		socket.emit('role_update', {
			role: game.roles.VISITOR
		})
	}

	socket.on('disconnect', function(data) {
		cleanupRoles();
	})

	// sync
	socket.on('new_attacker_pos', function (data) {
		if (socket != game.users[game.roles.ATTACKER]) {
			return;
		}

		game.attacker_pos.x = data.x;
		game.attacker_pos.y = data.y;

		console.log(game.attacker_pos);

		//socket.broadcast.emit('update_attacker_pos', data);
	});
	socket.on('shoot_projectile', function(data) {
		if (socket != game.users[game.roles.ATTACKER]) {
			return;
		}

		game.projectiles.push({id: game.unit_count, x: data.x, y: data.y});
		socket.broadcast.emit('create_projectile', {id: game.unit_count, x: data.x, y: data.y});
		socket.emit('create_projectile', {id: game.unit_count, x: data.x, y: data.y});
		game.unit_count++;

		console.log(game.projectiles);
	});
	socket.on('send_enemy', function (data) {
		if (socket != game.users[game.roles.DEFENDER]) {
			return;
		}

		game.units.push({x: data.x, y: data.y});

		console.log(game.units);

		socket.broadcast.emit('create_enemy', data);
	});

	function extractMillisFromScore(scoreString) {
		var result = /(\d{2}):(\d{2}):(\d{3})/.exec(scoreString);
		var min = praseInt(result[1])
		,   sec = praseInt(result[2])
		,   mil = praseInt(result[3]);

		sec += (min * 60);
		mil += (sec * 1000);

		return mil;
	}

	socket.on('attacker_down', function(data) {
		game.users.attacker.score = data.score;
		if (game.state == game.states.FIRST_ROUND) {
			var ex_attacker = game.users.attacker;
			var ex_defender = game.users.defender;
			game.users.attacker = ex_defender;
			game.users.defender = ex_attacker;
			game.users.attacker.emit('role_update', {
				role: game.roles.ATTACKER
			})
			game.users.defender.emit('role_update', {
				role: game.roles.DEFENDER
			})
			changeGameState(socket, game.states.BACK_ROUND);
		} else if (game.state == game.states.BACK_ROUND) {
			var attacker_score = extractMillisFromScore(game.users.attacker.score);
			var defender_score = extractMillisFromScore(game.users.defender.score);
			if (attacker_score > defender_score) {
				changeGameState(socket, game.states.ATTACKER_WIN);
			} else {
				changeGameState(socket, game.states.ATTACKER_LOST);
			}
		}

	})

	setInterval(broadcastAttackerPos, 35);
	setInterval(broadcastProjectilesPos, 35);

	cleanupRoles();
}