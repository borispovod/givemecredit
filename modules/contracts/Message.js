var private = {}, self = null,
	library = null, modules = null;

function Message(cb, _library) {
	self = this;
	self.type = 6
	library = _library;
	cb(null, self);
}

Message.prototype.create = function (data, trs) {
	
	trs.recipientId = data.recipientId;
	trs.asset = { message: data.message };
	trs.numLikes = data.numLikes; 
	trs.numDislikes = data.numDislikes;
	trs.creditsIa = data.creditsIa;
	console.log("hello from create!");
	return trs;
}

Message.prototype.calculateFee = function (trs) {
	return 1000;
}

Message.prototype.verify = function (trs, sender, cb, scope) {
	if (trs.asset.message.length > 320) {
		return setImmediate(cb, "Max length of message is 320 characters");
	}

	setImmediate(cb, null, trs);
}

Message.prototype.getBytes = function (trs) {
	return new Buffer(trs.asset.message, 'hex');
}

Message.prototype.apply = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Message.prototype.undo = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		balance: -trs.fee
	}, cb);
}

Message.prototype.applyUnconfirmed = function (trs, sender, cb, scope) {
	if (sender.u_balance < trs.fee) {
		return setImmediate(cb, "Sender doesn't have enough coins");
	}

	modules.blockchain.accounts.mergeAccountAndGet({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Message.prototype.undoUnconfirmed = function (trs, sender, cb, scope) {
	modules.blockchain.accounts.undoMerging({
		address: sender.address,
		u_balance: -trs.fee
	}, cb);
}

Message.prototype.ready = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

Message.prototype.save = function (trs, cb) {
	modules.api.sql.insert({
		table: "asset_likes",
		values: {
			transactionId: trs.id,
			message: trs.asset.message,
			numLikes: trs.numLikes,
			numDislikes: trs.numDislikes
		}
	}, cb);
	
	modules.api.sql.insert({
		table: "asset_messages",
		values: {
			transactionId: trs.id,
			creditsIa: trs.creditsIa
			
		}
	}, cb);
}

Message.prototype.dbRead = function (row) {
	if (!row.a_l_transactionId) {
		return null;
	} else {
		return {
			message: row.a_l_message
		};
	}
}

Message.prototype.normalize = function (asset, cb) {
	library.validator.validate(asset, {
		type: "object", // It is an object
		properties: {
			message: { // It contains a message property
				type: "string", // It is a string
				format: "hex", // It is in a hexadecimal format
				minLength: 1 // Minimum length of string is 1 character
			}
		},
		required: ["message"] // Message property is required and must be defined
	}, cb);
}

Message.prototype.onBind = function (_modules) {
	modules = _modules;
	modules.logic.transaction.attachAssetType(self.type, self);
}

Message.prototype.add = function (cb, query) {
	console.log(query);
	library.validator.validate(query, {
		type: "object",
		properties: {
			recipientId: {
				type: "string",
				minLength: 1,
				maxLength: 21
			},
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			},
			numLikes: {
				type: "string",
				maxLength: 21
			},
			numDislikes: {
				type: "string",
				maxLength: 21
			},
			message: {
				type: "string",
				minLength: 1,
				maxLength: 160
			},
			creditsIa: {
				type: "string",
				maxLength: 21
			}
		}
	}, function (err) {
		// If error exists, execute callback with error as first argument
		if (err) {
			return cb(err[0].message);
		}

		var keypair = modules.api.crypto.keypair(query.secret);
		modules.blockchain.accounts.getAccount({
			publicKey: keypair.publicKey.toString('hex')
		}, function (err, account) {
			// If error occurs, call cb with error argument
			if (err) {
				return cb(err);
			}

			try {
				var transaction = library.modules.logic.transaction.create({
					type: self.type,
					message: query.message,
					creditsIa: query.creditsIa,
					numLikes: query.numLikes,
					numDislikes: query.numDislikes,
					recipientId: query.recipientId,
					sender: account,
					keypair: keypair
				});
			} catch (e) {
				// Catch error if something goes wrong
				return setImmediate(cb, e.toString());
			}
			// Send transaction for processing
			modules.blockchain.transactions.processUnconfirmedTransaction(transaction, cb);
		});
	});
}

Message.prototype.list = function (cb, query) {
	// Verify query parameters
	library.validator.validate(query, {
		type: "object",
		properties: {
			recipientId: {
				type: "string",
				minLength: 2,
				maxLength: 21
			}
		},
		required: ["recipientId"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		// Select from transactions table and join messages from the asset_messages table
		modules.api.sql.select({
			table: "asset_likes",
			alias: "t_al",
			condition: {
                message: query.message
            }
		}, ['message', 'numLikes', 'numDislikes'], function (err, transactions) {
			if (err) {
				return cb(err.toString());
			}
			
			 // Map results to asset object
            var msg = transactions.map(function (tx) {
				return new Buffer(tx.message, 'hex').toString('utf8')
                });

			

			var likes = transactions.map(function (tx) {
				return parseInt(tx.numLikes);
			});
			
			var dislikes = transactions.map(function (tx) {
				return parseInt(tx.numDislikes);
			});
			
			var totalLikes=0;
			var totalDislikes=0;
			var i=0;
			var len;
			
				for (i = 0, len = likes.length; i < len; i++) {
    			totalLikes += parseInt(likes[i]); 
				}

				for (i = 0, len = dislikes.length; i < len; i++) {
    			totalDislikes += parseInt(dislikes[i]); 
				}
			
			return cb(null, {
				messages: msg,
				likes: totalLikes,
				dislikes: totalDislikes
			})
		});
	});
}


module.exports = Message;