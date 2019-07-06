'use strict';

var _ = require('lodash');

module.exports = function (db, module) {
	var helpers = require('./helpers');

	module.setAdd = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}

		await module.transaction(async function (client) {
			var query = client.query.bind(client);
			await helpers.ensureLegacyObjectType(client, key, 'set');
			await query({
				name: 'setAdd',
				text: `
INSERT INTO "legacy_set" ("_key", "member")
SELECT $1::TEXT, m
FROM UNNEST($2::TEXT[]) m
ON CONFLICT ("_key", "member")
DO NOTHING`,
				values: [key, value],
			});
		});
	};

	module.setsAdd = async function (keys, value) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}

		if (!Array.isArray(value)) {
			value = [value];
		}

		keys = _.uniq(keys);

		await module.transaction(async function (client) {
			var query = client.query.bind(client);
			await helpers.ensureLegacyObjectsType(client, keys, 'set');
			await query({
				name: 'setsAdd',
				text: `
INSERT INTO "legacy_set" ("_key", "member")
SELECT k, m
FROM UNNEST($1::TEXT[]) k
CROSS JOIN UNNEST($2::TEXT[]) m
ON CONFLICT ("_key", "member")
DO NOTHING`,
				values: [keys, value],
			});
		});
	};

	module.setRemove = async function (key, value) {
		if (!Array.isArray(key)) {
			key = [key];
		}

		if (!Array.isArray(value)) {
			value = [value];
		}

		await db.query({
			name: 'setRemove',
			text: `
DELETE FROM "legacy_set"
 WHERE "_key" = ANY($1::TEXT[])
   AND "member" = ANY($2::TEXT[])`,
			values: [key, value],
		});
	};

	module.setsRemove = async function (keys, value) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}

		await db.query({
			name: 'setsRemove',
			text: `
DELETE FROM "legacy_set"
 WHERE "_key" = ANY($1::TEXT[])
   AND "member" = $2::TEXT`,
			values: [keys, value],
		});
	};

	module.isSetMember = async function (key, value) {
		if (!key) {
			return false;
		}

		const res = await db.query({
			name: 'isSetMember',
			text: `
SELECT 1
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
    ON o."_key" = s."_key"
   AND o."type" = s."type"
 WHERE o."_key" = $1::TEXT
   AND s."member" = $2::TEXT`,
			values: [key, value],
		});

		return !!res.rows.length;
	};

	module.isSetMembers = async function (key, values) {
		if (!key || !Array.isArray(values) || !values.length) {
			return [];
		}

		values = values.map(helpers.valueToString);

		const res = await db.query({
			name: 'isSetMembers',
			text: `
SELECT s."member" m
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = $1::TEXT
   AND s."member" = ANY($2::TEXT[])`,
			values: [key, values],
		});

		return values.map(function (v) {
			return res.rows.some(r => r.m === v);
		});
	};

	module.isMemberOfSets = async function (sets, value) {
		if (!Array.isArray(sets) || !sets.length) {
			return [];
		}

		value = helpers.valueToString(value);

		const res = await db.query({
			name: 'isMemberOfSets',
			text: `
SELECT o."_key" k
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = ANY($1::TEXT[])
   AND s."member" = $2::TEXT`,
			values: [sets, value],
		});

		return sets.map(function (s) {
			return res.rows.some(r => r.k === s);
		});
	};

	module.getSetMembers = function (key, callback) {
		if (!key) {
			return callback(null, []);
		}

		db.query({
			name: 'getSetMembers',
			text: `
SELECT s."member" m
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = $1::TEXT`,
			values: [key],
		}, function (err, res) {
			if (err) {
				return callback(err);
			}

			callback(null, res.rows.map(function (r) {
				return r.m;
			}));
		});
	};

	module.getSetsMembers = function (keys, callback) {
		if (!Array.isArray(keys) || !keys.length) {
			return callback(null, []);
		}

		db.query({
			name: 'getSetsMembers',
			text: `
SELECT o."_key" k,
       array_agg(s."member") m
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = ANY($1::TEXT[])
 GROUP BY o."_key"`,
			values: [keys],
		}, function (err, res) {
			if (err) {
				return callback(err);
			}

			callback(null, keys.map(function (k) {
				return (res.rows.find(function (r) {
					return r.k === k;
				}) || { m: [] }).m;
			}));
		});
	};

	module.setCount = function (key, callback) {
		if (!key) {
			return callback(null, 0);
		}

		db.query({
			name: 'setCount',
			text: `
SELECT COUNT(*) c
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = $1::TEXT`,
			values: [key],
		}, function (err, res) {
			if (err) {
				return callback(err);
			}

			callback(null, parseInt(res.rows[0].c, 10));
		});
	};

	module.setsCount = function (keys, callback) {
		db.query({
			name: 'setsCount',
			text: `
SELECT o."_key" k,
       COUNT(*) c
  FROM "legacy_object_live" o
 INNER JOIN "legacy_set" s
         ON o."_key" = s."_key"
        AND o."type" = s."type"
 WHERE o."_key" = ANY($1::TEXT[])
 GROUP BY o."_key"`,
			values: [keys],
		}, function (err, res) {
			if (err) {
				return callback(err);
			}

			callback(null, keys.map(function (k) {
				return (res.rows.find(function (r) {
					return r.k === k;
				}) || { c: 0 }).c;
			}));
		});
	};

	module.setRemoveRandom = function (key, callback) {
		callback = callback || helpers.noop;

		db.query({
			name: 'setRemoveRandom',
			text: `
WITH A AS (
	SELECT s."member"
	  FROM "legacy_object_live" o
	 INNER JOIN "legacy_set" s
	         ON o."_key" = s."_key"
	        AND o."type" = s."type"
	 WHERE o."_key" = $1::TEXT
	 ORDER BY RANDOM()
	 LIMIT 1
	   FOR UPDATE)
DELETE FROM "legacy_set" s
 USING A
 WHERE s."_key" = $1::TEXT
   AND s."member" = A."member"
RETURNING A."member" m`,
			values: [key],
		}, function (err, res) {
			if (err) {
				return callback(err);
			}

			if (res.rows.length) {
				return callback(null, res.rows[0].m);
			}

			callback(null, null);
		});
	};
};
