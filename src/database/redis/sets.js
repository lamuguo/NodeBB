'use strict';

module.exports = function (redisClient, module) {
	var helpers = require('./helpers');

	module.setAdd = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}
		if (!value.length) {
			return;
		}
		await redisClient.async.sadd(key, value);
	};

	module.setsAdd = async function (keys, value) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}
		const batch = redisClient.batch();
		keys.forEach(k => batch.sadd(String(k), String(value)));
		await helpers.execBatch(batch);
	};

	module.setRemove = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}
		if (!Array.isArray(key)) {
			key = [key];
		}

		var batch = redisClient.batch();
		key.forEach(k => batch.srem(String(k), value));
		await helpers.execBatch(batch);
	};

	module.setsRemove = async function (keys, value) {
		var batch = redisClient.batch();
		keys.forEach(k => batch.srem(String(k), value));
		await helpers.execBatch(batch);
	};

	module.isSetMember = async function (key, value) {
		const result = await redisClient.async.sismember(key, value);
		return result === 1;
	};

	module.isSetMembers = async function (key, values) {
		const batch = redisClient.batch();
		values.forEach(v => batch.sismember(String(key), String(v)));
		const results = await helpers.execBatch(batch);
		return results ? helpers.resultsToBool(results) : null;
	};

	module.isMemberOfSets = async function (sets, value) {
		const batch = redisClient.batch();
		sets.forEach(s => batch.sismember(String(s), String(value)));
		const results = await helpers.execBatch(batch);
		return results ? helpers.resultsToBool(results) : null;
	};

	module.getSetMembers = function (key, callback) {
		redisClient.smembers(key, callback);
	};

	module.getSetsMembers = function (keys, callback) {
		helpers.execKeys(redisClient, 'batch', 'smembers', keys, callback);
	};

	module.setCount = function (key, callback) {
		redisClient.scard(key, callback);
	};

	module.setsCount = function (keys, callback) {
		helpers.execKeys(redisClient, 'batch', 'scard', keys, callback);
	};

	module.setRemoveRandom = function (key, callback) {
		callback = callback || function () {};
		redisClient.spop(key, callback);
	};

	return module;
};
