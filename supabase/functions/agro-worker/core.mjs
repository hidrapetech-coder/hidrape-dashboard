import {Buffer} from "node:buffer";
import __edge_pg from "pg";
import __edge_axios from "axios";
import * as __edge_zod from "zod";
import * as __edge_crypto from "node:crypto";
import * as __edge_https from "node:https";
import axios from "axios";
// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
// config/agro4.js
var require_agro4 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { z } = __edge_zod;
	const defaults = Object.freeze({
		mode: "agro-3",
		pollMinutes: 5,
		readingHeartbeatMinutes: 15,
		decisionHeartbeatMinutes: 15,
		changePoints: 2,
		missingCommunicationLimit: 3,
		freshnessMinutes: 30,
		retries: 2,
		timeoutMs: 4e3
	});
	const integer = (fallback, min, max) => z.coerce.number().int().min(min).max(max).default(fallback);
	const schema = z.object({
		AGRO4_MODE: z.enum([
			"agro-3",
			"shadow",
			"agro-4"
		]).default("agro-3"),
		AGRO_DATABASE_URL: z.string().url(),
		AGRO_DATABASE_ACK: z.literal("dedicated-agro"),
		AGRO_WORKER_SECRET: z.string().min(32),
		AGRO_POLL_MINUTES: integer(5, 1, 1440),
		AGRO_READING_HEARTBEAT_MINUTES: integer(15, 1, 1440),
		AGRO_DECISION_HEARTBEAT_MINUTES: integer(15, 1, 1440),
		AGRO_CHANGE_POINTS: z.coerce.number().positive().max(100).default(2),
		AGRO_MISSING_COMMUNICATION_LIMIT: integer(3, 1, 100),
		AGRO_SOURCE_RETRIES: integer(2, 0, 5),
		AGRO_SOURCE_TIMEOUT_MS: integer(4e3, 100, 2e4),
		AGRO_BLYNK_SERVER_URL: z.string().url().default("https://blynk.cloud").refine((raw) => {
			const u = new URL(raw);
			return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && u.pathname === "/" && (u.hostname === "blynk.cloud" || u.hostname.endsWith(".blynk.cloud"));
		}),
		AGRO4_CUTOVER_AT: z.preprocess((v) => v === "" ? void 0 : v, z.string().datetime({ offset: true }).optional()),
		AGRO_WORKER_API_URL: z.preprocess((v) => v === "" ? void 0 : v, z.string().url().refine((raw) => {
			const u = new URL(raw);
			return !u.username && !u.password && !u.search && !u.hash && (u.protocol === "https:" || u.protocol === "http:" && [
				"localhost",
				"127.0.0.1",
				"[::1]"
			].includes(u.hostname));
		}).optional())
	});
	const databaseIdentity = (raw) => {
		const url = new URL(raw);
		const host = url.hostname.toLowerCase();
		const user = decodeURIComponent(url.username);
		const project = host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] || (host.endsWith(".pooler.supabase.com") ? user.match(/\.([^.]+)$/)?.[1] : null);
		return `${project ? "supabase:" + project : host}/${decodeURIComponent(url.pathname).replace(/^\//, "")}`;
	};
	const readConfig = (env = process.env) => {
		const mode = env.AGRO4_MODE || "agro-3";
		if (mode === "agro-3") return defaults;
		const result = schema.safeParse(env);
		if (!result.success) throw new Error("AGRO_CONFIG_INVALID: " + [...new Set(result.error.issues.map((i) => i.path[0]))].join(", "));
		const value = result.data;
		const target = new URL(value.AGRO_DATABASE_URL);
		if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("AGRO_DATABASE_URL_INVALID");
		if (target.searchParams.get("pgbouncer") === "true" || target.hostname.endsWith(".pooler.supabase.com") && target.port === "6543") throw new Error("AGRO_SESSION_CONNECTION_REQUIRED");
		for (const original of [env.DATABASE_URL, env.DIRECT_URL].filter(Boolean)) if (databaseIdentity(original) === databaseIdentity(value.AGRO_DATABASE_URL)) throw new Error("AGRO_DATABASE_MUST_BE_SEPARATE");
		if (value.AGRO_READING_HEARTBEAT_MINUTES < value.AGRO_POLL_MINUTES) throw new Error("AGRO_HEARTBEAT_BELOW_POLL");
		if (mode === "agro-4" && !value.AGRO4_CUTOVER_AT) throw new Error("AGRO4_CUTOVER_AT_REQUIRED");
		return Object.freeze({
			...defaults,
			mode,
			databaseUrl: value.AGRO_DATABASE_URL,
			workerSecret: value.AGRO_WORKER_SECRET,
			pollMinutes: value.AGRO_POLL_MINUTES,
			readingHeartbeatMinutes: value.AGRO_READING_HEARTBEAT_MINUTES,
			decisionHeartbeatMinutes: value.AGRO_DECISION_HEARTBEAT_MINUTES,
			changePoints: value.AGRO_CHANGE_POINTS,
			missingCommunicationLimit: value.AGRO_MISSING_COMMUNICATION_LIMIT,
			retries: value.AGRO_SOURCE_RETRIES,
			timeoutMs: value.AGRO_SOURCE_TIMEOUT_MS,
			blynkServerUrl: value.AGRO_BLYNK_SERVER_URL,
			cutoverAt: value.AGRO4_CUTOVER_AT || null,
			workerApiUrl: value.AGRO_WORKER_API_URL || null
		});
	};
	module.exports = {
		readConfig,
		defaults,
		databaseIdentity
	};
}));
// lib/agroDb.js
var require_agroDb = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { readConfig } = require_agro4();
	let singleton;
	const createAgroPool = (config, Pool) => {
		const underlying = new Pool({
			connectionString: config.databaseUrl,
			max: 2,
			connectionTimeoutMillis: 5e3,
			idleTimeoutMillis: 3e4,
			query_timeout: 1e4,
			statement_timeout: 1e4,
			application_name: "hidrape-agro4"
		});
		underlying.on("error", () => console.error("[Agro4] Conexão agro indisponível."));
		const connect = async () => {
			const client = await underlying.connect();
			try {
				const check = await client.query("SELECT (to_regclass('public.\"User\"') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')) AS \"authTable\",(SELECT \"id\" FROM \"AgroStorageIdentity\" WHERE \"id\"=$1) AS marker", ["hidrape-agro4-dedicated"]);
				if (check.rows[0]?.authTable || check.rows[0]?.marker !== "hidrape-agro4-dedicated") throw new Error("AGRO_DATABASE_NOT_DEDICATED");
				return client;
			} catch {
				client.release();
				throw new Error("AGRO_DATABASE_NOT_READY_OR_NOT_DEDICATED");
			}
		};
		return {
			connect,
			query: async (sql, params) => {
				const client = await connect();
				try {
					return await client.query(sql, params);
				} finally {
					client.release();
				}
			},
			end: () => underlying.end()
		};
	};
	const getAgroPool = () => {
		const config = readConfig();
		if (config.mode === "agro-3") throw new Error("AGRO4_DISABLED");
		singleton ||= createAgroPool(config, __edge_pg.Pool);
		return singleton;
	};
	module.exports = {
		getAgroPool,
		createAgroPool
	};
}));
// services/agro4/repository.js
var require_repository = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { randomUUID } = __edge_crypto;
	module.exports = { AgroRepository: class AgroRepository {
		constructor(pool, client = null) {
			this.pool = pool;
			this.client = client;
		}
		query(sql, params = []) {
			return (this.client || this.pool).query(sql, params);
		}
		async transaction(work) {
			const client = this.client || await this.pool.connect(), repo = new AgroRepository(this.pool, client);
			try {
				await client.query("BEGIN");
				const value = await work(repo);
				await client.query("COMMIT");
				return value;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			} finally {
				if (!this.client) client.release();
			}
		}
		async withDeviceLock(deviceId, work) {
			const client = await this.pool.connect();
			let locked = false;
			try {
				locked = (await client.query("SELECT pg_try_advisory_lock(hashtext($1),hashtext($2)) AS locked", ["hidrape-agro4", deviceId])).rows[0].locked;
				return locked ? await work(new AgroRepository(this.pool, client)) : {
					skipped: true,
					reason: "BUSY"
				};
			} finally {
				try {
					if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))", ["hidrape-agro4", deviceId]);
				} finally {
					client.release();
				}
			}
		}
		async enroll(userId, config, credential, authorization = {}) {
			return this.transaction(async (repo) => {
				await repo.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", ["hidrape-agro4-enroll", userId]);
				const existing = await repo.primaryDevice(userId);
				if (existing) {
					await repo.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", ["hidrape-agro4", existing.id]);
					const current = await repo.primaryDevice(userId);
					await repo.syncAuthorization(current, {
						active: true,
						config,
						credential,
						...authorization
					}, /* @__PURE__ */ new Date());
					return {
						id: existing.id,
						talhaoId: existing.talhaoId
					};
				}
				const propertyId = randomUUID(), talhaoId = randomUUID(), id = randomUUID();
				await repo.query("INSERT INTO \"AgroProperty\" (\"id\",\"userId\",\"name\") VALUES ($1,$2,$3)", [
					propertyId,
					userId,
					"Propriedade Principal"
				]);
				await repo.query("INSERT INTO \"Talhao\" (\"id\",\"userId\",\"propertyId\",\"cultura\",\"config\") VALUES ($1,$2,$3,$4,$5::jsonb)", [
					talhaoId,
					userId,
					propertyId,
					config.tipoPlantacao,
					JSON.stringify(config)
				]);
				await repo.query("INSERT INTO \"AgroDevice\" (\"id\",\"userId\",\"talhaoId\",\"primaryKey\",\"credential\",\"state\") VALUES ($1,$2,$3,$4,$5,$6::jsonb)", [
					id,
					userId,
					talhaoId,
					`${userId}:principal`,
					credential,
					JSON.stringify({
						needsEvaluation: true,
						authorizationRevision: authorization.revision,
						sensorRevision: authorization.sensorRevision
					})
				]);
				return {
					id,
					talhaoId
				};
			});
		}
		async primaryDevice(userId) {
			return (await this.query("SELECT d.*,t.\"config\" FROM \"AgroDevice\" d JOIN \"Talhao\" t ON t.\"id\"=d.\"talhaoId\" AND t.\"userId\"=d.\"userId\" WHERE d.\"userId\"=$1 AND d.\"primaryKey\"=$2", [userId, `${userId}:principal`])).rows[0] || null;
		}
		async ownedDevice(userId, deviceId) {
			return (await this.query("SELECT d.*,t.\"config\" FROM \"AgroDevice\" d JOIN \"Talhao\" t ON t.\"id\"=d.\"talhaoId\" AND t.\"userId\"=d.\"userId\" WHERE d.\"userId\"=$1 AND d.\"id\"=$2 AND d.\"active\"=true", [userId, deviceId])).rows[0] || null;
		}
		async deviceForWorker(deviceId) {
			return (await this.query("SELECT \"id\",\"userId\",\"active\" FROM \"AgroDevice\" WHERE \"id\"=$1", [deviceId])).rows[0] || null;
		}
		async syncAuthorization(device, authorization, at) {
			if (!authorization.active) {
				await this.query("UPDATE \"AgroDevice\" SET \"active\"=false,\"credential\"=$1 WHERE \"id\"=$2 AND \"userId\"=$3", [
					"",
					device.id,
					device.userId
				]);
				return null;
			}
			const changed = device.state.authorizationRevision !== authorization.revision;
			const replaced = !!device.state.sensorRevision && device.state.sensorRevision !== authorization.sensorRevision;
			const state = {
				...device.state,
				authorizationRevision: authorization.revision,
				sensorRevision: authorization.sensorRevision,
				needsEvaluation: changed || device.state.needsEvaluation
			};
			if (replaced) Object.assign(state, {
				historySince: new Date(at).toISOString(),
				lastMeasurementAt: null,
				measurementValue: null,
				lastSeenAt: null,
				lastPersistedAt: null,
				persistedValue: null,
				value: null,
				quality: "MISSING",
				connectionStatus: "UNKNOWN",
				communicationMisses: 0,
				investigationRequired: false
			});
			await this.query("UPDATE \"Talhao\" SET \"config\"=$1::jsonb,\"cultura\"=$2 WHERE \"id\"=$3 AND \"userId\"=$4", [
				JSON.stringify(authorization.config),
				authorization.config.tipoPlantacao,
				device.talhaoId,
				device.userId
			]);
			await this.query("UPDATE \"AgroDevice\" SET \"credential\"=$1,\"active\"=true,\"state\"=$2::jsonb WHERE \"id\"=$3 AND \"userId\"=$4", [
				authorization.credential,
				JSON.stringify(state),
				device.id,
				device.userId
			]);
			return {
				...device,
				active: true,
				config: authorization.config,
				credential: authorization.credential,
				state
			};
		}
		async deactivate(userId) {
			return this.transaction(async (repo) => {
				const device = await repo.primaryDevice(userId);
				if (!device) return false;
				await repo.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", ["hidrape-agro4", device.id]);
				await repo.query("UPDATE \"AgroDevice\" SET \"active\"=false,\"credential\"=$1 WHERE \"userId\"=$2 AND \"id\"=$3", [
					"",
					userId,
					device.id
				]);
				return true;
			});
		}
		async listDevices() {
			return (await this.query("SELECT d.*,t.\"config\" FROM \"AgroDevice\" d JOIN \"Talhao\" t ON t.\"id\"=d.\"talhaoId\" AND t.\"userId\"=d.\"userId\" WHERE d.\"active\"=true ORDER BY (d.\"state\"->>'lastAttemptedAt')::timestamptz NULLS FIRST,d.\"id\"")).rows;
		}
		async recordAttempt(userId, deviceId, at) {
			await this.query("UPDATE \"AgroDevice\" SET \"state\"=jsonb_set(\"state\",'{lastAttemptedAt}',to_jsonb($1::timestamptz),true) WHERE \"userId\"=$2 AND \"id\"=$3", [
				new Date(at),
				userId,
				deviceId
			]);
		}
		async hasPoll(deviceId, scheduledAt) {
			return (await this.query("SELECT 1 FROM \"AgroPoll\" WHERE \"deviceId\"=$1 AND \"scheduledAt\"=$2", [deviceId, scheduledAt])).rowCount > 0;
		}
		async saveCollection(device, plan, scheduledAt) {
			const id = randomUUID();
			if (!(await this.query("INSERT INTO \"AgroPoll\" (\"id\",\"userId\",\"deviceId\",\"scheduledAt\",\"collectedAt\",\"observedAt\",\"value\",\"unit\",\"source\",\"quality\",\"communicationConfirmed\",\"measurementConfirmed\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (\"deviceId\",\"scheduledAt\") DO NOTHING RETURNING \"id\"", [
				id,
				device.userId,
				device.id,
				scheduledAt,
				plan.collectedAt,
				plan.observedAt,
				plan.value,
				plan.unit,
				plan.source,
				plan.quality,
				plan.communicationConfirmed,
				plan.measurementConfirmed
			])).rowCount) return null;
			if (plan.persistReading) await this.query("INSERT INTO \"AgroReading\" (\"id\",\"userId\",\"deviceId\",\"pollId\",\"value\",\"unit\",\"source\",\"quality\",\"independent\",\"reason\",\"observedAt\",\"collectedAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (\"deviceId\",\"observedAt\") DO NOTHING", [
				randomUUID(),
				device.userId,
				device.id,
				id,
				plan.value,
				plan.unit,
				plan.source,
				plan.quality,
				plan.independent,
				plan.reason,
				plan.reason === "MEASUREMENT" ? plan.observedAt : null,
				plan.collectedAt
			]);
			await this.query("UPDATE \"AgroDevice\" SET \"state\"=$1::jsonb WHERE \"id\"=$2 AND \"userId\"=$3", [
				JSON.stringify({
					...plan.state,
					needsEvaluation: false
				}),
				device.id,
				device.userId
			]);
			return id;
		}
		async history(userId, deviceId, now, since = null) {
			return (await this.query("SELECT \"id\",\"value\" AS \"umidade\",\"observedAt\" AS \"data\" FROM \"AgroReading\" WHERE \"userId\"=$1 AND \"deviceId\"=$2 AND \"independent\"=true AND \"quality\"=$3 AND \"observedAt\">=$4 AND \"observedAt\"<=$5 AND \"collectedAt\"<=$5 ORDER BY \"observedAt\" DESC,\"id\" DESC LIMIT 200", [
				userId,
				deviceId,
				"VALID",
				new Date(Math.max(now - 864e5, since ? new Date(since).getTime() : -Infinity)),
				new Date(now)
			])).rows;
		}
		async events(userId, deviceId, start, end) {
			return (await this.query("SELECT * FROM \"AgroEvent\" WHERE \"userId\"=$1 AND \"deviceId\"=$2 AND \"occurredAt\">=$3 AND \"occurredAt\"<=$4 AND \"receivedAt\"<=$4 ORDER BY \"occurredAt\",\"id\"", [
				userId,
				deviceId,
				start,
				end
			])).rows;
		}
		async createEvent(userId, event) {
			const result = await this.query("INSERT INTO \"AgroEvent\" (\"id\",\"userId\",\"deviceId\",\"idempotencyKey\",\"type\",\"origin\",\"value\",\"unit\",\"occurredAt\",\"timeZone\") SELECT $1,$2,d.\"id\",$4,$5,$6,$7,$8,$9,$10 FROM \"AgroDevice\" d WHERE d.\"id\"=$3 AND d.\"userId\"=$2 AND d.\"active\"=true ON CONFLICT (\"userId\",\"idempotencyKey\") DO NOTHING RETURNING *", [
				randomUUID(),
				userId,
				event.deviceId,
				event.idempotencyKey,
				event.type,
				"USER",
				event.value,
				event.unit,
				event.occurredAt,
				event.timeZone
			]);
			if (result.rowCount) return result.rows[0];
			const prior = (await this.query("SELECT * FROM \"AgroEvent\" WHERE \"userId\"=$1 AND \"idempotencyKey\"=$2", [userId, event.idempotencyKey])).rows[0];
			if (prior && prior.deviceId === event.deviceId && prior.type === event.type && prior.value === event.value && prior.unit === event.unit && new Date(prior.occurredAt).getTime() === Date.parse(event.occurredAt) && prior.timeZone === event.timeZone) return prior;
			throw new Error("AGRO_EVENT_CONFLICT");
		}
		async previousDecision(userId, deviceId, mode) {
			return (await this.query("SELECT * FROM \"AgroDecision\" WHERE \"userId\"=$1 AND \"deviceId\"=$2 AND \"mode\"=$3 ORDER BY \"createdAt\" DESC,\"id\" DESC LIMIT 1", [
				userId,
				deviceId,
				mode
			])).rows[0] || null;
		}
		async saveEvaluation(device, pollId, snapshot, comparison, mode, kind, now) {
			await this.query("INSERT INTO \"AgroEvaluation\" (\"id\",\"userId\",\"deviceId\",\"pollId\",\"mode\",\"createdAt\",\"payload\",\"comparison\") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)", [
				snapshot.snapshotId,
				device.userId,
				device.id,
				pollId,
				mode,
				new Date(now),
				JSON.stringify(snapshot),
				JSON.stringify(comparison)
			]);
			if (!kind) return null;
			const decision = {
				id: randomUUID(),
				action: snapshot.engineData.recommendation.action,
				riskLevel: snapshot.engineData.risk.level,
				kind
			};
			await this.query("INSERT INTO \"AgroDecision\" (\"id\",\"userId\",\"deviceId\",\"evaluationId\",\"action\",\"riskLevel\",\"kind\",\"mode\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
				decision.id,
				device.userId,
				device.id,
				snapshot.snapshotId,
				decision.action,
				decision.riskLevel,
				kind,
				mode,
				new Date(now)
			]);
			if (mode === "agro-4" && kind === "TRANSITION" && snapshot.engineData.confidence.eligible && ["IRRIGAR", "EXCESSO_UMIDADE"].includes(decision.action)) await this.query("INSERT INTO \"AgroDelivery\" (\"id\",\"userId\",\"deviceId\",\"decisionId\",\"status\") VALUES ($1,$2,$3,$4,$5)", [
				randomUUID(),
				device.userId,
				device.id,
				decision.id,
				"PENDING"
			]);
			return decision;
		}
		async latestEvaluation(userId, deviceId, cutoverAt) {
			return (await this.query("SELECT \"payload\" FROM \"AgroEvaluation\" WHERE \"userId\"=$1 AND \"deviceId\"=$2 AND \"mode\"=$3 AND \"createdAt\">=$4 ORDER BY \"createdAt\" DESC LIMIT 1", [
				userId,
				deviceId,
				"agro-4",
				cutoverAt
			])).rows[0]?.payload || null;
		}
		async pendingDeliveries(userId, deviceId) {
			return (await this.query("SELECT d.*,e.\"payload\" FROM \"AgroDelivery\" d JOIN \"AgroDecision\" c ON c.\"id\"=d.\"decisionId\" AND c.\"userId\"=d.\"userId\" JOIN \"AgroEvaluation\" e ON e.\"id\"=c.\"evaluationId\" AND e.\"userId\"=d.\"userId\" WHERE d.\"userId\"=$1 AND d.\"deviceId\"=$2 AND d.\"status\" IN ($3,$4) AND d.\"attempts\"<3 ORDER BY e.\"createdAt\"", [
				userId,
				deviceId,
				"PENDING",
				"FAILED"
			])).rows;
		}
		async deliveryStatus(userId, id, status, now) {
			await this.query("UPDATE \"AgroDelivery\" SET \"status\"=$1,\"attempts\"=\"attempts\"+CASE WHEN $1=$2 THEN 1 ELSE 0 END,\"attemptedAt\"=CASE WHEN $1=$2 THEN $3 ELSE \"attemptedAt\" END,\"deliveredAt\"=CASE WHEN $1=$4 THEN $3 ELSE \"deliveredAt\" END WHERE \"userId\"=$5 AND \"id\"=$6", [
				status,
				"SENDING",
				new Date(now),
				"SENT",
				userId,
				id
			]);
		}
		async recordRun(start, end, counters) {
			await this.query("INSERT INTO \"AgroWorkerRun\" (\"id\",\"startedAt\",\"finishedAt\",\"counters\") VALUES ($1,$2,$3,$4::jsonb)", [
				randomUUID(),
				new Date(start),
				new Date(end),
				JSON.stringify(counters)
			]);
		}
		async metrics(userId, start, end, gapMinutes = 15) {
			return {
				timeZone: "UTC",
				polls: (await this.query("SELECT (\"collectedAt\" AT TIME ZONE $4)::date::text AS dia,COUNT(*)::int AS coletas,COUNT(*) FILTER (WHERE \"quality\"=$5)::int AS sem_confirmacao,COUNT(*) FILTER (WHERE \"quality\" IN ($6,$7))::int AS falhas FROM \"AgroPoll\" WHERE \"userId\"=$1 AND \"collectedAt\">=$2 AND \"collectedAt\"<$3 GROUP BY 1 ORDER BY 1", [
					userId,
					start,
					end,
					"UTC",
					"UNCONFIRMED",
					"OFFLINE",
					"API_ERROR"
				])).rows,
				readings: (await this.query("SELECT (\"collectedAt\" AT TIME ZONE $4)::date::text AS dia,COUNT(*)::int AS registros,COUNT(*) FILTER (WHERE \"independent\")::int AS medicoes FROM \"AgroReading\" WHERE \"userId\"=$1 AND \"collectedAt\">=$2 AND \"collectedAt\"<$3 GROUP BY 1 ORDER BY 1", [
					userId,
					start,
					end,
					"UTC"
				])).rows,
				gaps: (await this.query("WITH p AS (SELECT \"deviceId\",\"collectedAt\",LAG(\"collectedAt\") OVER (PARTITION BY \"deviceId\" ORDER BY \"collectedAt\") AS anterior FROM \"AgroPoll\" WHERE \"userId\"=$1 AND \"collectedAt\">=$2 AND \"collectedAt\"<$3) SELECT \"deviceId\",anterior,\"collectedAt\",EXTRACT(EPOCH FROM (\"collectedAt\"-anterior))/60 AS \"minutes\" FROM p WHERE \"collectedAt\"-anterior>make_interval(mins=>$4::int) ORDER BY \"collectedAt\"", [
					userId,
					start,
					end,
					gapMinutes
				])).rows,
				currentGaps: (await this.query("SELECT d.\"id\" AS \"deviceId\",MAX(p.\"collectedAt\") AS \"lastCollectionAt\",EXTRACT(EPOCH FROM ($2::timestamptz-COALESCE(MAX(p.\"collectedAt\"),d.\"createdAt\")))/60 AS minutes FROM \"AgroDevice\" d LEFT JOIN \"AgroPoll\" p ON p.\"deviceId\"=d.\"id\" AND p.\"userId\"=d.\"userId\" AND p.\"collectedAt\"<=$2 WHERE d.\"userId\"=$1 AND d.\"active\"=true GROUP BY d.\"id\",d.\"createdAt\" HAVING $2::timestamptz-COALESCE(MAX(p.\"collectedAt\"),d.\"createdAt\")>make_interval(mins=>$3::int)", [
					userId,
					end,
					gapMinutes
				])).rows,
				devices: (await this.query("SELECT \"id\",\"state\" FROM \"AgroDevice\" WHERE \"userId\"=$1", [userId])).rows.map(({ id, state }) => ({
					deviceId: id,
					quality: state.quality || "MISSING",
					connectionStatus: state.connectionStatus || "UNKNOWN",
					communicationMisses: state.communicationMisses || 0,
					investigationRequired: !!state.investigationRequired,
					lastSeenAt: state.lastSeenAt || null,
					lastMeasurementAt: state.lastMeasurementAt || null,
					collectedAt: state.collectedAt || null
				})),
				gapBasis: "INTERVAL_BETWEEN_POLLS_NOT_PHYSICAL_DEVICE_FAILURE"
			};
		}
		async readingCount(userId, cutoverAt) {
			return Number((await this.query("SELECT COUNT(*) AS total FROM \"AgroReading\" WHERE \"userId\"=$1 AND \"independent\"=true AND \"quality\"=$2 AND \"observedAt\">=$3", [
				userId,
				"VALID",
				cutoverAt
			])).rows[0].total);
		}
		async readingPage(userId, cutoverAt, offset, limit) {
			return (await this.query("SELECT \"value\" AS \"umidade\",\"observedAt\" AS \"data\" FROM \"AgroReading\" WHERE \"userId\"=$1 AND \"independent\"=true AND \"quality\"=$2 AND \"observedAt\">=$3 ORDER BY \"observedAt\" DESC,\"id\" DESC OFFSET $4 LIMIT $5", [
				userId,
				"VALID",
				cutoverAt,
				offset,
				limit
			])).rows;
		}
		async aggregates(userId, cutoverAt, start, end, zone, limits, firstDate, lastDate) {
			const rows = (await this.query("SELECT to_char(\"observedAt\" AT TIME ZONE $5,'YYYY-MM-DD') AS dia,AVG(\"value\") AS avg_umidade,COUNT(*) AS total_dia,COUNT(*) FILTER (WHERE \"value\"<=$6) AS qtd_seco,COUNT(*) FILTER (WHERE \"value\">$7) AS qtd_encharcado,COUNT(*) FILTER (WHERE \"value\">$6 AND \"value\"<=$7) AS qtd_ideal FROM \"AgroReading\" WHERE \"userId\"=$1 AND \"observedAt\">=$2 AND \"observedAt\">=$3 AND \"observedAt\"<$4 AND \"independent\"=true AND \"quality\"='VALID' GROUP BY 1 ORDER BY 1", [
				userId,
				cutoverAt,
				start,
				end,
				zone,
				limits.minIdeal,
				limits.maxIdeal
			])).rows;
			const decisions = Number((await this.query("SELECT COUNT(*) AS total FROM \"AgroDecision\" WHERE \"userId\"=$1 AND \"createdAt\">=$2 AND \"createdAt\">=$3 AND \"createdAt\"<$4 AND to_char(\"createdAt\" AT TIME ZONE $5,'YYYY-MM-DD') BETWEEN $6 AND $7 AND \"mode\"='agro-4' AND \"kind\"='TRANSITION' AND \"action\"='IRRIGAR'", [
				userId,
				cutoverAt,
				start,
				end,
				zone,
				firstDate,
				lastDate
			])).rows[0].total);
			return {
				rows: rows.filter((row) => row.dia >= firstDate && row.dia <= lastDate),
				decisions
			};
		}
	} };
}));
// config/agro.js
var require_agro = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = Object.freeze({
		version: "agro-3",
		freshnessMinutes: 30,
		historyHours: 24,
		historyLimit: 200,
		minSamples: 5,
		minSpanHours: 1,
		frozenTolerance: .1,
		jumpPoints: 25,
		jumpMinutes: 30,
		refillPoints: 3,
		maxDropPointsPerHour: 10,
		maxForecastHours: 24,
		minFitR2: .7
	});
}));
// config/cultures.js
var require_cultures = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const CULTURES_CONFIG = Object.freeze({
		"cana-de-açúcar": {
			minIdeal: 35,
			maxIdeal: 60,
			center: 47.5,
			kc: 1.05
		},
		"hortaliças": {
			minIdeal: 50,
			maxIdeal: 80,
			center: 65,
			kc: .95
		},
		"milho": {
			minIdeal: 40,
			maxIdeal: 70,
			center: 55,
			kc: 1.15
		},
		"feijão": {
			minIdeal: 40,
			maxIdeal: 60,
			center: 50,
			kc: 1.05
		}
	});
	const getCropConfig = (tipo) => {
		const user = typeof tipo === "object" && tipo !== null ? tipo : null;
		tipo = user ? user.tipoPlantacao : tipo;
		const key = typeof tipo === "string" ? tipo.normalize("NFC").trim().toLowerCase() : "";
		if (key === "personalizado" && Number.isFinite(user?.minIdeal) && Number.isFinite(user?.maxIdeal) && user.minIdeal >= 0 && user.maxIdeal <= 100 && user.minIdeal < user.maxIdeal) return {
			minIdeal: user.minIdeal,
			maxIdeal: user.maxIdeal,
			center: (user.minIdeal + user.maxIdeal) / 2,
			kc: null,
			supported: true,
			basis: "USER_SENSOR_PERCENT"
		};
		const config = CULTURES_CONFIG[key];
		return config ? {
			...config,
			supported: true,
			basis: "REFERENCE_SENSOR_PERCENT"
		} : {
			minIdeal: null,
			maxIdeal: null,
			center: null,
			kc: null,
			supported: false,
			basis: "UNCONFIGURED"
		};
	};
	module.exports = {
		CULTURES_CONFIG,
		getCropConfig
	};
}));
// services/agroEngine/dataQuality.js
var require_dataQuality = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const rules = require_agro();
	const isMoisture = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
	const timestamp = (value) => value instanceof Date || typeof value === "string" ? new Date(value).getTime() : NaN;
	const normalizeHistory = (history, now = Date.now()) => {
		const issues = [], readings = [], seen = /* @__PURE__ */ new Map();
		for (const row of Array.isArray(history) ? history : []) {
			const time = timestamp(row?.data);
			if (!isMoisture(row?.umidade) || !Number.isFinite(time) || time > now) {
				issues.push("Leitura inválida ou com data futura.");
				continue;
			}
			if (seen.has(time)) {
				issues.push(seen.get(time) === row.umidade ? "Timestamp duplicado." : "Leituras conflitantes no mesmo timestamp.");
				continue;
			}
			seen.set(time, row.umidade);
			readings.push({
				data: new Date(time).toISOString(),
				umidade: row.umidade
			});
		}
		readings.sort((a, b) => timestamp(b.data) - timestamp(a.data));
		return {
			readings,
			issues: [...new Set(issues)]
		};
	};
	const evaluateDataQuality = (history, now = Date.now()) => {
		const { readings, issues } = normalizeHistory(history, now);
		const last = readings[0];
		const ageMinutes = last ? (now - timestamp(last.data)) / 6e4 : null;
		const staleData = !last || ageMinutes > rules.freshnessMinutes;
		const spanHours = readings.length ? (timestamp(last.data) - timestamp(readings.at(-1).data)) / 36e5 : 0;
		if (!last) issues.push("Nenhuma leitura válida disponível.");
		if (last && staleData) issues.push("Leitura com mais de 30 minutos; atualizar o sensor.");
		if (readings.length < rules.minSamples || spanHours < rules.minSpanHours) issues.push("Histórico insuficiente: mínimo de 5 leituras distintas ao longo de 1 hora.");
		const eligible = !!last && !staleData && issues.length === 0;
		const score = !last ? 0 : eligible ? 100 : staleData ? 20 : 35;
		return {
			score,
			level: score === 0 ? "INVALID" : eligible ? "HIGH" : "LOW",
			eligible,
			sensorStatus: !last ? "OFFLINE" : staleData ? "STALE" : "ONLINE",
			lastUpdate: last?.data ?? null,
			ageMinutes,
			spanHours,
			sampleCount: readings.length,
			staleData,
			anomaliesDetected: issues.length > 0,
			missingData: !last,
			issues
		};
	};
	module.exports = {
		evaluateDataQuality,
		normalizeHistory,
		isMoisture,
		timestamp
	};
}));
// services/agroEngine/anomalyDetection.js
var require_anomalyDetection = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const rules = require_agro();
	const { normalizeHistory, timestamp } = require_dataQuality();
	const detectAnomalies = (history, climate, quality, now = Date.now()) => {
		const anomalies = [];
		const { readings } = normalizeHistory(history, now);
		if (!quality.eligible) anomalies.push({
			type: "DATA_QUALITY",
			severity: "HIGH",
			explanation: quality.issues.join(" ")
		});
		const recent = readings.filter((r) => now - timestamp(r.data) <= rules.historyHours * 36e5);
		const flat = [];
		for (const row of recent) {
			if (Math.abs(row.umidade - recent[0].umidade) > rules.frozenTolerance) break;
			flat.push(row);
		}
		const span = flat.length ? (timestamp(flat[0].data) - timestamp(flat.at(-1).data)) / 36e5 : 0;
		if (flat.length >= rules.minSamples && span >= rules.minSpanHours) anomalies.push({
			type: "FROZEN_SENSOR",
			severity: "HIGH",
			explanation: `Variação de até ${rules.frozenTolerance} ponto percentual em ${span.toFixed(1)}h; possível sensor congelado ou solo estável. Conferir antes de recomendar manejo.`
		});
		for (let i = 1; i < recent.length; i++) {
			const minutes = (timestamp(recent[i - 1].data) - timestamp(recent[i].data)) / 6e4;
			const change = recent[i - 1].umidade - recent[i].umidade;
			if (minutes <= rules.jumpMinutes && Math.abs(change) > rules.jumpPoints) {
				if (i >= rules.minSamples && (timestamp(recent[0].data) - timestamp(recent[i - 1].data)) / 36e5 >= rules.minSpanHours) {
					anomalies.push({
						type: "PAST_JUMP",
						severity: "INFO",
						explanation: "Variação abrupta anterior; há pelo menos 5 novas leituras ao longo de 1h após o evento."
					});
					break;
				}
				anomalies.push({
					type: change > 0 ? "RAPID_WETTING" : "ABRUPT_DROP",
					severity: "HIGH",
					explanation: change > 0 ? "Aumento rápido: pode ser chuva, irrigação ou falha. Aguardar confirmação por novas leituras." : "Queda abrupta; conferir leitura e instalação antes de recomendar irrigação."
				});
				break;
			}
		}
		return anomalies;
	};
	module.exports = { detectAnomalies };
}));
// services/agroEngine/climateAnalyzer.js
var require_climateAnalyzer = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const finite = (x, min = -Infinity, max = Infinity) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
	const weatherTimestamp = (value, offset = 0) => {
		if (finite(value)) return value * 1e3;
		if (typeof value !== "string") return NaN;
		return /Z$|[+-]\d\d:\d\d$/.test(value) ? Date.parse(value) : Date.parse(value + "Z") - offset * 1e3;
	};
	const analyzeClimate = (data, satellite, now = Date.now()) => {
		const result = {
			available: false,
			temperature: null,
			humidity: null,
			windSpeed: null,
			eto: null,
			maxRainProb12h: null,
			expectedRainVolume12h: null,
			macroMoisture: null,
			climateMultiplier: null,
			source: "Open-Meteo",
			precipitationUnit: "mm",
			etoUnit: "mm/day",
			forecastHours: 0
		};
		if (!data || data.error) return result;
		const offset = finite(data.utc_offset_seconds) ? data.utc_offset_seconds : 0;
		const age = now - weatherTimestamp(data.current?.time, offset);
		const currentValid = age >= 0 && age <= 72e5 && finite(data.current?.temperature_2m, -90, 65) && finite(data.current?.relative_humidity_2m, 0, 100);
		if (currentValid) {
			result.temperature = data.current.temperature_2m;
			result.humidity = data.current.relative_humidity_2m;
			result.windSpeed = finite(data.current.wind_speed_10m, 0, 500) ? data.current.wind_speed_10m : null;
		}
		const today = new Date(now + offset * 1e3).toISOString().slice(0, 10);
		const dailyIndex = (Array.isArray(data.daily?.time) ? data.daily.time : [])?.findIndex((t) => typeof t === "string" ? t.slice(0, 10) === today : (/* @__PURE__ */ new Date(t * 1e3 + offset * 1e3)).toISOString().slice(0, 10) === today) ?? -1;
		const eto = data.daily?.et0_fao_evapotranspiration?.[dailyIndex];
		if (finite(eto, 0, 30)) result.eto = eto;
		const hours = [], seen = /* @__PURE__ */ new Set();
		for (const [i, t] of (Array.isArray(data.hourly?.time) ? data.hourly.time : []).entries()) {
			const time = weatherTimestamp(t, offset), rain = data.hourly.precipitation?.[i], prob = data.hourly.precipitation_probability?.[i];
			if (time > now && time <= now + 432e5 && !seen.has(time) && finite(rain, 0, 1e3) && finite(prob, 0, 100)) {
				seen.add(time);
				hours.push({
					time,
					rain,
					prob
				});
			}
		}
		hours.sort((a, b) => a.time - b.time);
		result.forecastHours = hours.length;
		const contiguous = hours.length === 12 && hours.every((h, i) => !i || h.time - hours[i - 1].time === 36e5);
		if (contiguous) {
			result.maxRainProb12h = Math.max(...hours.map((h) => h.prob));
			result.expectedRainVolume12h = hours.reduce((s, h) => s + h.rain, 0);
		}
		result.available = currentValid && contiguous && result.eto !== null;
		if (satellite?.available && finite(satellite.umidadeMacro, 0, 100)) result.macroMoisture = satellite.umidadeMacro;
		return result;
	};
	module.exports = {
		analyzeClimate,
		weatherTimestamp
	};
}));
// services/agroEngine/mlPredictor.js
var require_mlPredictor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { getCropConfig } = require_cultures();
	const rules = require_agro();
	const { normalizeHistory, timestamp, evaluateDataQuality } = require_dataQuality();
	const predictMoisture = (history, climate, cropType, now = Date.now()) => {
		const config = getCropConfig(cropType);
		const { readings, issues } = normalizeHistory(history, now);
		const current = readings[0]?.umidade ?? null;
		const segment = [];
		for (const row of readings) {
			if (segment.length && segment.at(-1).umidade - row.umidade > rules.refillPoints) break;
			segment.push(row);
		}
		const span = segment.length ? (timestamp(segment[0].data) - timestamp(segment.at(-1).data)) / 36e5 : 0;
		let drop = null, r2 = null;
		if (!issues.length && evaluateDataQuality(history, now).eligible && segment.length >= rules.minSamples && span >= rules.minSpanHours) {
			const xs = segment.map((r) => (timestamp(r.data) - timestamp(segment[0].data)) / 36e5);
			const ys = segment.map((r) => r.umidade);
			const meanX = xs.reduce((a, b) => a + b, 0) / xs.length, meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
			const xx = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
			const yy = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
			const xy = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
			const candidate = xx > 0 ? -xy / xx : null;
			r2 = xx > 0 && yy > 0 ? xy ** 2 / (xx * yy) : null;
			if (candidate > 0 && candidate <= rules.maxDropPointsPerHour && r2 >= rules.minFitR2) drop = candidate;
		}
		const horizonHours = Math.min(rules.maxForecastHours, span);
		const ageHours = readings.length ? (now - timestamp(readings[0].data)) / 36e5 : 0;
		const forecast = {};
		for (const hours of [
			6,
			12,
			24
		]) {
			forecast[`in${hours}h`] = drop !== null && hours + ageHours <= horizonHours ? Math.max(0, Math.min(100, current - drop * (hours + ageHours))) : null;
			forecast[`in${hours}h_min`] = null;
			forecast[`in${hours}h_max`] = null;
		}
		const deficit = current !== null && config.supported ? Math.max(0, config.minIdeal - current) : null;
		const time = drop !== null && config.supported ? Math.max(0, (current - config.minIdeal) / drop - ageHours) : null;
		return {
			predictions: forecast,
			dynamicDropRate: drop,
			hoursUntilStress: deficit !== null && current <= config.minIdeal ? 0 : time !== null && time <= horizonHours ? time : null,
			criticalLimit: config.minIdeal,
			upperLimit: config.maxIdeal,
			cropSupported: config.supported,
			currentMoisture: current,
			deficitAtual: deficit,
			modelType: drop === null ? "UNAVAILABLE" : "OBSERVED_LINEAR_TREND",
			sampleCount: segment.length,
			spanHours: span,
			horizonHours,
			fitR2: r2,
			unit: "sensor_percentage_points_per_hour",
			limitations: ["Tendência condicional à continuidade da secagem; chuva e irrigação podem interrompê-la.", "ET₀ e chuva em mm não são convertidas em porcentagem do sensor."]
		};
	};
	module.exports = { predictMoisture };
}));
// services/agroEngine/riskAndConfidence.js
var require_riskAndConfidence = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const calculateRiskAndConfidence = (quality, anomalies, predictor, history, climate = {}) => {
		const blocked = !quality.eligible || anomalies.some((a) => ["HIGH", "CRITICAL"].includes(a.severity)) || !predictor.cropSupported;
		const factors = [...quality.issues, ...anomalies.map((a) => a.explanation)];
		if (!predictor.cropSupported) factors.push("Cultura sem faixa de referência configurada.");
		if (!climate.available) factors.push("Clima indisponível; avaliação limitada ao sensor.");
		if (predictor.dynamicDropRate === null) factors.push("Tendência de secagem indisponível.");
		const confidence = {
			score: blocked ? Math.min(quality.score, 35) : climate.available && predictor.dynamicDropRate !== null ? 90 : 65,
			level: blocked ? "LOW" : climate.available && predictor.dynamicDropRate !== null ? "HIGH" : "MEDIUM",
			eligible: !blocked,
			factors: [...new Set(factors)],
			basis: "OPERATIONAL_SCORE_NOT_PROBABILITY"
		};
		const wet = predictor.upperLimit !== null && predictor.currentMoisture > predictor.upperLimit;
		const dry = predictor.hoursUntilStress === 0;
		const near = predictor.hoursUntilStress !== null && predictor.hoursUntilStress <= 6;
		return {
			confidence,
			risk: blocked ? {
				score: null,
				level: "UNKNOWN",
				factors: ["Dados insuficientes para classificar risco agronômico."]
			} : {
				score: wet || dry ? 90 : near ? 70 : 10,
				level: wet || dry ? "HIGH" : near ? "MEDIUM" : "LOW",
				factors: wet ? ["Umidade acima da faixa de referência."] : dry ? ["Umidade no limite inferior ou abaixo."] : near ? ["Tendência próxima ao limite inferior."] : ["Sem desvio atual da faixa de referência."]
			}
		};
	};
	module.exports = { calculateRiskAndConfidence };
}));
// services/agroEngine/decisionMaker.js
var require_decisionMaker = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const makeDecision = (quality, anomalies, climate, predictor, riskAndConfidence, current) => {
		if (!quality.eligible || !riskAndConfidence.confidence.eligible || anomalies.some((a) => ["HIGH", "CRITICAL"].includes(a.severity))) return {
			action: "VERIFICAR_SENSOR",
			explanation: ["Recomendação de manejo suspensa: conferir sensor, histórico e configuração da cultura.", ...riskAndConfidence.confidence.factors]
		};
		const explanation = [];
		let action = "MONITORAR";
		if (current > predictor.upperLimit) {
			action = "EXCESSO_UMIDADE";
			explanation.push(`Umidade de ${current}% acima da faixa de referência (${predictor.upperLimit}%). Evite acrescentar água e confira a condição do solo e a drenagem.`);
		} else if (current <= predictor.criticalLimit) {
			action = "IRRIGAR";
			explanation.push(`Umidade de ${current}% no limite inferior ou abaixo (${predictor.criticalLimit}%). Avalie a irrigação após confirmar a leitura no campo. Volume e duração dependem de calibração do solo e do sistema.`);
		} else if (predictor.hoursUntilStress !== null && predictor.hoursUntilStress <= 6) {
			action = "ATENÇÃO";
			explanation.push(`Se a secagem observada continuar, o limite de referência poderá ser atingido em ${predictor.hoursUntilStress.toFixed(1)}h. Monitorar novamente antes do manejo.`);
		} else explanation.push(`Leitura atual de ${current}% dentro da faixa de referência. Continue monitorando.`);
		if (!climate.available) explanation.push("Clima indisponível; não foi possível avaliar a previsão meteorológica.");
		else if (climate.expectedRainVolume12h > 0) explanation.push(`Precipitação prevista em 12h: ${climate.expectedRainVolume12h.toFixed(1)} mm. Não comprova chuva no talhão nem reposição do déficit do sensor.`);
		if (predictor.dynamicDropRate === null) explanation.push("Sem tendência de secagem confiável para estimar horário de irrigação.");
		return {
			action,
			explanation
		};
	};
	module.exports = { makeDecision };
}));
// services/agroEngine/index.js
var require_agroEngine = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto = __edge_crypto;
	const rules = require_agro();
	const { getCropConfig } = require_cultures();
	const { evaluateDataQuality, normalizeHistory } = require_dataQuality();
	const { detectAnomalies } = require_anomalyDetection();
	const { analyzeClimate } = require_climateAnalyzer();
	const { predictMoisture } = require_mlPredictor();
	const { calculateRiskAndConfidence } = require_riskAndConfidence();
	const { makeDecision } = require_decisionMaker();
	const evaluate = (user, history, weather, satellite, now = Date.now()) => {
		const quality = evaluateDataQuality(history, now), { readings } = normalizeHistory(history, now);
		if (user.sensorOnline === false) {
			quality.eligible = false;
			quality.score = 0;
			quality.level = "INVALID";
			quality.sensorStatus = "OFFLINE";
			quality.issues.push("A última consulta ao dispositivo falhou; confirmar comunicação e leitura.");
		}
		const anomalies = detectAnomalies(history, weather, quality, now);
		const climate = analyzeClimate(weather, satellite, now);
		const predictor = predictMoisture(history, climate, user, now);
		const { risk, confidence } = calculateRiskAndConfidence(quality, anomalies, predictor, history, climate);
		const current = readings[0]?.umidade ?? null;
		const recommendation = makeDecision(quality, anomalies, climate, predictor, {
			risk,
			confidence
		}, current);
		if (!confidence.eligible) {
			predictor.hoursUntilStress = null;
			predictor.dynamicDropRate = null;
			for (const key of Object.keys(predictor.predictions)) predictor.predictions[key] = null;
		}
		const engineData = {
			version: rules.version,
			dataQuality: quality,
			anomalies,
			climateAnalysis: climate,
			predictor,
			predictions: predictor.predictions,
			risk,
			confidence,
			recommendation,
			inputs: {
				culture: user.tipoPlantacao,
				limits: getCropConfig(user),
				sensorOnline: user.sensorOnline ?? null,
				rules,
				history: (Array.isArray(history) ? history : []).map((row) => ({
					data: row?.data,
					umidade: row?.umidade
				})),
				readings,
				weather,
				satellite
			},
			evaluatedAt: new Date(now).toISOString()
		};
		const snapshotId = crypto.createHash("sha256").update(JSON.stringify({
			userId: user.id,
			...engineData
		})).digest("hex");
		const status = {
			IRRIGAR: "critico",
			ATENÇÃO: "alerta",
			EXCESSO_UMIDADE: "alerta",
			MONITORAR: "normal",
			VERIFICAR_SENSOR: "indisponivel"
		}[recommendation.action];
		const sensorState = {
			status: quality.sensorStatus.toLowerCase(),
			hasValidData: confidence.eligible,
			lastReadingAt: quality.lastUpdate,
			dataAgeMinutes: quality.ageMinutes,
			umidadeAtual: current,
			reason: quality.issues.join(" ")
		};
		return {
			snapshotId,
			sensorState,
			tempoHoras: predictor.hoursUntilStress,
			recomendacao: recommendation.explanation.join(" "),
			status,
			_meta: {
				dropRealTime: predictor.dynamicDropRate,
				limiteCultura: predictor.criticalLimit,
				rainProb: climate.maxRainProb12h,
				sensorState
			},
			engineData
		};
	};
	module.exports = { evaluate };
}));
// services/agro4/domain.js
var require_domain = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto = __edge_crypto;
	const { evaluate } = require_agroEngine();
	const { normalizeHistory, isMoisture } = require_dataQuality();
	const rules = require_agro();
	const { defaults } = require_agro4();
	const canonical = (value) => {
		if (value instanceof Date) return value.toJSON();
		if (Array.isArray(value)) return value.map(canonical);
		if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
		return value;
	};
	const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
	const ms = (value) => value == null ? NaN : new Date(value).getTime();
	const planCollection = (previous, poll, now, config = defaults) => {
		if (!Number.isFinite(now)) throw new Error("INVALID_CLOCK");
		const collectedAt = new Date(now).toISOString();
		const timestamp = ms(poll.observedAt);
		const measurementConfirmed = poll.measurementConfirmed === true && Number.isFinite(timestamp) && timestamp <= now;
		const communicationConfirmed = poll.communicationConfirmed === true;
		const validValue = isMoisture(poll.value);
		let quality = poll.status === "OFFLINE" ? "OFFLINE" : poll.status === "API_ERROR" ? "API_ERROR" : !validValue ? "INVALID" : !measurementConfirmed ? "UNCONFIRMED" : now - timestamp > config.freshnessMinutes * 6e4 ? "STALE" : "VALID";
		if (poll.observedAt != null && (!Number.isFinite(timestamp) || timestamp > now)) quality = "INVALID";
		if (measurementConfirmed && previous?.lastMeasurementAt && timestamp < ms(previous.lastMeasurementAt)) quality = "OUT_OF_ORDER";
		if (measurementConfirmed && timestamp === ms(previous?.lastMeasurementAt) && validValue && poll.value !== previous?.measurementValue) quality = "CONFLICT";
		const latestMeasurement = measurementConfirmed && validValue && ![
			"OUT_OF_ORDER",
			"CONFLICT",
			"INVALID"
		].includes(quality);
		const newMeasurement = latestMeasurement && timestamp !== ms(previous?.lastMeasurementAt);
		const significant = validValue && (!isMoisture(previous?.persistedValue) || Math.abs(poll.value - previous.persistedValue) >= config.changePoints);
		const heartbeat = !previous?.lastPersistedAt || now - ms(previous.lastPersistedAt) >= config.readingHeartbeatMinutes * 6e4;
		const persistReading = newMeasurement || significant || heartbeat;
		const misses = communicationConfirmed ? 0 : (previous?.communicationMisses || 0) + 1;
		return {
			collectedAt,
			observedAt: measurementConfirmed ? new Date(timestamp).toISOString() : null,
			value: validValue ? poll.value : null,
			unit: "sensor_percent",
			source: "BLYNK",
			quality,
			communicationConfirmed,
			measurementConfirmed,
			independent: newMeasurement && quality === "VALID",
			persistReading,
			reason: newMeasurement ? "MEASUREMENT" : significant ? "CHANGE" : heartbeat ? "HEARTBEAT" : "POLL",
			state: {
				...previous,
				value: validValue ? poll.value : null,
				quality,
				collectedAt,
				lastSeenAt: communicationConfirmed ? collectedAt : previous?.lastSeenAt || null,
				lastMeasurementAt: latestMeasurement ? new Date(timestamp).toISOString() : previous?.lastMeasurementAt || null,
				measurementValue: latestMeasurement ? poll.value : previous?.measurementValue ?? null,
				connectionStatus: poll.status === "OFFLINE" ? "OFFLINE" : communicationConfirmed ? "ONLINE" : "UNKNOWN",
				communicationMisses: misses,
				investigationRequired: misses >= config.missingCommunicationLimit,
				lastPersistedAt: persistReading ? collectedAt : previous?.lastPersistedAt || null,
				persistedValue: persistReading && validValue ? poll.value : previous?.persistedValue ?? null
			}
		};
	};
	const classifyJump = (events, { userId, deviceId, start, end, now }) => {
		const matches = events.filter((e) => e.userId === userId && e.deviceId === deviceId && ms(e.occurredAt) >= start && ms(e.occurredAt) <= end && ms(e.receivedAt) <= now && ["RAIN", "IRRIGATION"].includes(e.type) && typeof e.value === "number" && Number.isFinite(e.value) && e.value > 0);
		const types = [...new Set(matches.map((e) => e.type))];
		return {
			classification: types.length === 1 ? types[0] : "UNEXPLAINED",
			eventIds: matches.map((e) => e.id)
		};
	};
	const evaluatePhase1 = ({ user, history, weather = null, satellite = null, events = [], deviceId, state, now, config = defaults }) => {
		const healthy = state?.quality === "VALID" && state?.connectionStatus === "ONLINE" && Number.isFinite(ms(state.lastMeasurementAt)) && now - ms(state.lastMeasurementAt) <= rules.freshnessMinutes * 6e4 && now - ms(state.collectedAt) <= config.pollMinutes * 2 * 6e4;
		const snapshot = evaluate({
			...user,
			sensorOnline: !!healthy
		}, history, weather, satellite, now);
		const { readings } = normalizeHistory(history, now);
		const jumps = [];
		for (let i = 1; i < readings.length; i++) {
			const start = ms(readings[i].data), end = ms(readings[i - 1].data);
			if ((end - start) / 6e4 <= rules.jumpMinutes && readings[i - 1].umidade - readings[i].umidade > rules.jumpPoints) jumps.push({
				...classifyJump(events, {
					userId: user.id,
					deviceId,
					start,
					end,
					now
				}),
				start: new Date(start).toISOString(),
				end: new Date(end).toISOString()
			});
		}
		snapshot.engineData.version = "agro-4-phase-1";
		snapshot.engineData.eventContext = jumps;
		const reasons = jumps.map((j) => j.classification === "RAIN" ? "Salto associado a registro de chuva medida; a qualidade do sensor continua sendo verificada." : j.classification === "IRRIGATION" ? "Salto associado a registro de irrigação realizada; a qualidade do sensor continua sendo verificada." : "Salto sem causa observada inequívoca; conferir no campo.");
		if (!healthy) reasons.unshift(state?.quality === "UNCONFIRMED" ? "A fonte não confirma o horário de uma nova medição. Consulta e heartbeat não são amostras independentes." : "Qualidade, comunicação ou atualidade da medição insuficientes.");
		if (state?.investigationRequired) reasons.push(`${state.communicationMisses} consultas consecutivas sem confirmação de comunicação. Investigue conexão, alimentação e disponibilidade da origem; isso não comprova defeito físico do sensor.`);
		snapshot.engineData.recommendation.explanation.push(...reasons);
		snapshot.recomendacao = snapshot.engineData.recommendation.explanation.join(" ");
		snapshot.sensorState = {
			...snapshot.sensorState,
			quality: state?.quality || "MISSING",
			communicationMisses: state?.communicationMisses || 0,
			investigationRequired: !!state?.investigationRequired,
			lastSeenAt: state?.lastSeenAt || null,
			lastMeasurementAt: state?.lastMeasurementAt || null,
			collectedAt: state?.collectedAt || null,
			reason: reasons.concat(snapshot.sensorState.reason || []).join(" ")
		};
		snapshot._meta.sensorState = snapshot.sensorState;
		snapshot.snapshotId = hash({
			userId: user.id,
			deviceId,
			engineData: snapshot.engineData,
			sensorState: snapshot.sensorState
		});
		return snapshot;
	};
	const compactSnapshot = (snapshot, { history, deviceId, now }) => {
		const { history: ignored, readings: ignoredReadings, ...inputs } = snapshot.engineData.inputs;
		const rows = normalizeHistory(history, now).readings;
		return {
			...snapshot,
			engineData: {
				...snapshot.engineData,
				inputs: {
					...inputs,
					historyRef: {
						deviceId,
						count: rows.length,
						from: rows.at(-1)?.data || null,
						to: rows[0]?.data || null,
						asOf: new Date(now).toISOString(),
						hash: hash(rows),
						limit: rules.historyLimit
					}
				},
				rulesHash: hash(rules)
			}
		};
	};
	const decisionKind = (previous, snapshot, now, config = defaults) => !previous || previous.action !== snapshot.engineData.recommendation.action || previous.riskLevel !== snapshot.engineData.risk.level ? "TRANSITION" : now - ms(previous.createdAt) >= config.decisionHeartbeatMinutes * 6e4 ? "HEARTBEAT" : null;
	module.exports = {
		hash,
		planCollection,
		classifyJump,
		evaluatePhase1,
		compactSnapshot,
		decisionKind
	};
}));
// services/agro4/credentials.js
var require_credentials = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto = __edge_crypto;
	const key = (secret) => crypto.hkdfSync("sha256", Buffer.from(secret), Buffer.from("hidrape-agro4"), Buffer.from("device-credentials"), 32);
	const seal = (value, secret) => {
		const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
		const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
		return [
			iv,
			cipher.getAuthTag(),
			data
		].map((b) => b.toString("base64url")).join(".");
	};
	const open = (value, secret) => {
		try {
			const [iv, tag, data] = value.split(".").map((v) => Buffer.from(v, "base64url"));
			const cipher = crypto.createDecipheriv("aes-256-gcm", key(secret), iv);
			cipher.setAuthTag(tag);
			return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"));
		} catch {
			throw new Error("AGRO_CREDENTIAL_UNAVAILABLE");
		}
	};
	module.exports = {
		seal,
		open
	};
}));
// services/agro4/worker.js
var require_worker = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { planCollection, evaluatePhase1, compactSnapshot, decisionKind, hash } = require_domain();
	const { evaluate } = require_agroEngine();
	const { open } = require_credentials();
	const createWorker = ({ repository, source, config, sendAlert, resolveDevice, context = async () => ({
		weather: null,
		satellite: null
	}), now = Date.now, log = () => {}, shouldContinue = () => true }) => {
		if (typeof resolveDevice !== "function") throw Error("AGRO_AUTHORIZATION_REQUIRED");
		let running = false;
		const refresh = async (repo, device) => {
			const authorization = await resolveDevice(device);
			if (authorization.deviceId !== device.id || authorization.userId !== device.userId) throw Error("AGRO_AUTHORIZATION_UNAVAILABLE");
			return repo.transaction((tx) => tx.syncAuthorization(device, authorization, new Date(now())));
		};
		const freshMeasurement = (snapshot) => {
			const age = now() - Date.parse(snapshot.sensorState.lastMeasurementAt);
			return Number.isFinite(age) && age >= 0 && age <= config.freshnessMinutes * 6e4;
		};
		const deliver = async (repo, device) => {
			if (config.mode !== "agro-4" || now() < Date.parse(config.cutoverAt)) return;
			const current = await repo.ownedDevice(device.userId, device.id);
			if (!current) return;
			const authorization = await resolveDevice(current);
			if (authorization.deviceId !== current.id || authorization.userId !== current.userId) throw Error("AGRO_AUTHORIZATION_UNAVAILABLE");
			if (!authorization.active || authorization.revision !== current.state.authorizationRevision) {
				await repo.transaction((tx) => tx.syncAuthorization(current, authorization, new Date(now())));
				return;
			}
			const secrets = open(authorization.credential, config.workerSecret);
			const latest = await repo.latestEvaluation(device.userId, device.id, config.cutoverAt);
			if (!latest?.engineData.confidence.eligible || latest.sensorState.quality !== "VALID" || !freshMeasurement(latest) || latest.engineData.authorizationRevision !== current.state.authorizationRevision || now() < Date.parse(latest.engineData.evaluatedAt) || now() - Date.parse(latest.engineData.evaluatedAt) > config.pollMinutes * 2 * 6e4 || latest.engineData.configurationHash !== hash(device.config) || hash(latest.engineData.inputs.limits) !== hash(require_cultures().getCropConfig(device.config))) return;
			for (const delivery of await repo.pendingDeliveries(device.userId, device.id)) {
				const snapshot = delivery.payload;
				if (snapshot.engineData.recommendation.action !== latest.engineData.recommendation.action || now() - Date.parse(snapshot.engineData.evaluatedAt) > config.pollMinutes * 2 * 6e4) {
					await repo.deliveryStatus(device.userId, delivery.id, "EXPIRED", now());
					continue;
				}
				if (!secrets.whatsappPhone || !secrets.callmebotApiKey || !snapshot.engineData.confidence.eligible || !["IRRIGAR", "EXCESSO_UMIDADE"].includes(snapshot.engineData.recommendation.action) || snapshot.engineData.recommendation.action !== latest.engineData.recommendation.action || now() - Date.parse(snapshot.engineData.evaluatedAt) > config.pollMinutes * 2 * 6e4 || hash(snapshot.engineData.inputs.limits) !== hash(require_cultures().getCropConfig(device.config))) continue;
				await repo.deliveryStatus(device.userId, delivery.id, "SENDING", now());
				if (!freshMeasurement(latest)) {
					await repo.deliveryStatus(device.userId, delivery.id, "EXPIRED", now());
					continue;
				}
				try {
					await sendAlert(secrets, latest.engineData.recommendation);
				} catch {
					await repo.deliveryStatus(device.userId, delivery.id, "UNKNOWN", now());
					log("delivery_failed");
					continue;
				}
				await repo.deliveryStatus(device.userId, delivery.id, "SENT", now());
			}
		};
		const collectDevice = (device, scheduledAt) => repository.withDeviceLock(device.id, async (repo) => {
			let current = await repo.ownedDevice(device.userId, device.id);
			if (!current) return { skipped: true };
			if (repo.recordAttempt) {
				await repo.recordAttempt(current.userId, current.id, now());
				current.state = {
					...current.state,
					lastAttemptedAt: new Date(now()).toISOString()
				};
			}
			current = await refresh(repo, current);
			if (!current) return {
				skipped: true,
				reason: "DISABLED"
			};
			const secrets = open(current.credential, config.workerSecret);
			if (await repo.hasPoll(current.id, scheduledAt)) {
				await deliver(repo, current);
				return { skipped: true };
			}
			const poll = await source.collect({
				token: secrets.blynkToken,
				pin: current.pin
			});
			if (!shouldContinue()) return {
				skipped: true,
				reason: "BUDGET"
			};
			const at = now(), plan = planCollection(current.state, poll, at, config);
			const ancillary = await context(current).catch(() => ({
				weather: null,
				satellite: null
			}));
			if (!shouldContinue()) return {
				skipped: true,
				reason: "BUDGET"
			};
			const output = await repo.transaction(async (tx) => {
				const pollId = await tx.saveCollection(current, plan, scheduledAt);
				if (!pollId) return { skipped: true };
				const history = await tx.history(current.userId, current.id, at, current.state.historySince || null);
				const events = await tx.events(current.userId, current.id, /* @__PURE__ */ new Date(at - 864e5), new Date(at));
				const user = {
					...current.config,
					id: current.userId
				};
				const snapshot = evaluatePhase1({
					user,
					history,
					...ancillary,
					events,
					deviceId: current.id,
					state: plan.state,
					now: at,
					config
				});
				snapshot.engineData.configurationHash = hash(current.config);
				snapshot.engineData.authorizationRevision = current.state.authorizationRevision;
				snapshot.engineData.sourceEpoch = current.state.historySince || null;
				snapshot.snapshotId = hash({
					userId: current.userId,
					deviceId: current.id,
					engineData: snapshot.engineData,
					sensorState: snapshot.sensorState
				});
				const legacy = evaluate({
					...user,
					sensorOnline: plan.state.connectionStatus === "ONLINE"
				}, history, ancillary.weather, ancillary.satellite, at);
				const comparison = {
					version: legacy.engineData.version,
					action: legacy.engineData.recommendation.action,
					riskLevel: legacy.engineData.risk.level,
					eligible: legacy.engineData.confidence.eligible,
					snapshotId: legacy.snapshotId
				};
				const prior = await tx.previousDecision(current.userId, current.id, config.mode);
				const mode = config.mode === "agro-4" && at < Date.parse(config.cutoverAt) ? "shadow" : config.mode;
				const effectivePrior = mode === config.mode ? prior : await tx.previousDecision(current.userId, current.id, mode);
				const kind = decisionKind(effectivePrior, snapshot, at, config);
				const compact = compactSnapshot(snapshot, {
					history,
					deviceId: current.id,
					now: at
				});
				await tx.saveEvaluation(current, pollId, compact, comparison, mode, kind, at);
				return {
					quality: plan.quality,
					persisted: plan.persistReading,
					independent: plan.independent,
					decision: kind
				};
			});
			await deliver(repo, current);
			return output;
		});
		const runOnce = async () => {
			if (running) return { skipped: true };
			running = true;
			const started = now(), counters = {
				devices: 0,
				collected: 0,
				failed: 0,
				skipped: 0,
				independent: 0,
				unconfirmed: 0,
				sourceUnavailable: 0
			};
			try {
				const scheduledAt = /* @__PURE__ */ new Date(Math.floor(started / (config.pollMinutes * 6e4)) * config.pollMinutes * 6e4);
				for (const device of await repository.listDevices()) {
					counters.devices++;
					if (!shouldContinue()) {
						counters.skipped++;
						continue;
					}
					try {
						const result = await collectDevice(device, scheduledAt);
						if (result.skipped) counters.skipped++;
						else {
							counters.collected++;
							if (result.independent) counters.independent++;
							if (result.quality === "UNCONFIRMED") counters.unconfirmed++;
							if ([
								"OFFLINE",
								"API_ERROR",
								"INVALID"
							].includes(result.quality)) counters.sourceUnavailable++;
						}
					} catch {
						counters.failed++;
						log("collection_failed");
					}
				}
				await repository.recordRun(started, now(), counters);
				return counters;
			} finally {
				running = false;
			}
		};
		return { runOnce };
	};
	module.exports = { createWorker };
}));
// services/iot/blynk.js
var require_blynk = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const axios = __edge_axios;
	const { isMoisture } = require_dataQuality();
	const parseSensorValue = (value) => {
		if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) throw new Error("INVALID_SENSOR_VALUE");
		const number = Number(value);
		if (!isMoisture(number)) throw new Error("INVALID_SENSOR_VALUE");
		return number;
	};
	const createBlynkSource = ({ http = axios, baseUrl = "https://blynk.cloud", getUrl = null, timeoutMs = 4e3, connectionTimeoutMs = timeoutMs, retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) => ({ collect: async ({ token, pin = "V0" }) => {
		let communicationConfirmed = false;
		for (let attempt = 0; attempt <= retries; attempt++) try {
			const request = async (url, deadline) => {
				const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadline);
				try {
					return await http.get(url, {
						timeout: deadline,
						signal: controller.signal,
						maxRedirects: 0,
						maxContentLength: 65536
					});
				} finally {
					clearTimeout(timer);
				}
			};
			const valueUrl = getUrl || `${baseUrl.replace(/\/$/, "")}/external/api/get`;
			const connected = await request(`${valueUrl.replace("/get", "/isHardwareConnected")}?${new URLSearchParams({ token })}`, connectionTimeoutMs);
			if (connected.data !== true && connected.data !== "true") return {
				status: "OFFLINE",
				value: null,
				communicationConfirmed: false,
				measurementConfirmed: false,
				observedAt: null
			};
			communicationConfirmed = true;
			const response = await request(`${valueUrl}?${new URLSearchParams({
				token,
				[pin]: ""
			})}`, timeoutMs);
			return {
				status: "ONLINE",
				value: parseSensorValue(response.data),
				communicationConfirmed: true,
				measurementConfirmed: false,
				observedAt: null
			};
		} catch (error) {
			if (error.message === "INVALID_SENSOR_VALUE") return {
				status: "INVALID",
				value: null,
				communicationConfirmed,
				measurementConfirmed: false,
				observedAt: null
			};
			const status = error.response?.status;
			if (attempt >= retries || status && status !== 429 && status < 500) break;
			const retryAfter = Number(error.response?.headers?.["retry-after"]);
			if (Number.isFinite(retryAfter) && retryAfter > 2) break;
			await sleep(Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1e3 : Math.min(2e3, 250 * 2 ** attempt));
		}
		return {
			status: "API_ERROR",
			value: null,
			communicationConfirmed,
			measurementConfirmed: false,
			observedAt: null
		};
	} });
	module.exports = {
		parseSensorValue,
		createBlynkSource
	};
}));
// services/agro4/controlPlane.js
var require_controlPlane = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const axios = __edge_axios;
	const { z } = __edge_zod;
	const activeSchema = z.object({
		active: z.literal(true),
		deviceId: z.string(),
		userId: z.string(),
		revision: z.string().regex(/^[a-f0-9]{64}$/),
		sensorRevision: z.string().regex(/^[a-f0-9]{64}$/),
		config: z.object({
			tipoPlantacao: z.string(),
			minIdeal: z.number().nullable(),
			maxIdeal: z.number().nullable(),
			timeZone: z.string().nullable(),
			cidade: z.string(),
			lat: z.number().nullable(),
			lon: z.number().nullable()
		}).strict(),
		credential: z.string().min(1)
	}).strict();
	const inactiveSchema = z.object({
		active: z.literal(false),
		deviceId: z.string(),
		userId: z.string()
	}).strict();
	const createControlPlane = ({ url, secret, http = axios }) => async (device) => {
		try {
			const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4e3);
			let response;
			try {
				response = await http.post(new URL("/api/agro/worker/authorization", url).href, { deviceId: device.id }, {
					headers: { Authorization: `Bearer ${secret}` },
					timeout: 4e3,
					signal: controller.signal,
					maxRedirects: 0,
					maxContentLength: 65536
				});
			} finally {
				clearTimeout(timer);
			}
			const result = z.union([activeSchema, inactiveSchema]).parse(response.data);
			if (result.deviceId !== device.id || result.userId !== device.userId) throw Error("OWNER_MISMATCH");
			return result;
		} catch {
			throw Error("AGRO_AUTHORIZATION_UNAVAILABLE");
		}
	};
	module.exports = { createControlPlane };
}));
// lib/httpJson.js
var require_httpJson = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const https = __edge_https;
	const getJson = (url, { timeout = 8e3, maxBytes = 1048576, headers = {}, signal } = {}) => new Promise((resolve, reject) => {
		let settled = false, request, timer;
		const onAbort = () => {
			finish(/* @__PURE__ */ new Error("EXTERNAL_ABORTED"));
			request?.destroy();
		};
		const finish = (error, data) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			error ? reject(error) : resolve(data);
		};
		if (signal?.aborted) return finish(/* @__PURE__ */ new Error("EXTERNAL_ABORTED"));
		request = https.get(url, { headers }, (response) => {
			if (response.statusCode !== 200) {
				response.resume();
				return finish(/* @__PURE__ */ new Error("EXTERNAL_HTTP_ERROR"));
			}
			const chunks = [];
			let bytes = 0;
			response.on("data", (chunk) => {
				bytes += chunk.length;
				if (bytes > maxBytes) {
					finish(/* @__PURE__ */ new Error("EXTERNAL_BODY_LIMIT"));
					request.destroy();
					return;
				}
				chunks.push(Buffer.from(chunk));
			});
			response.on("error", () => finish(/* @__PURE__ */ new Error("EXTERNAL_RESPONSE_ERROR")));
			response.on("aborted", () => finish(/* @__PURE__ */ new Error("EXTERNAL_ABORTED")));
			response.on("end", () => {
				try {
					finish(null, JSON.parse(Buffer.concat(chunks).toString()));
				} catch {
					finish(/* @__PURE__ */ new Error("EXTERNAL_INVALID_JSON"));
				}
			});
		});
		timer = setTimeout(() => {
			finish(/* @__PURE__ */ new Error("EXTERNAL_TIMEOUT"));
			request.destroy();
		}, timeout);
		request.on("error", () => finish(/* @__PURE__ */ new Error("EXTERNAL_CONNECTION_ERROR")));
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) onAbort();
	});
	const validCoordinates = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
	module.exports = {
		getJson,
		validCoordinates
	};
}));
// \0agro-edge-no-legacy-cache
var require__agro_edge_no_legacy_cache = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = new Proxy({}, { get() {
		throw Error("AGRO_LEGACY_CACHE_FORBIDDEN");
	} });
}));
// services/weatherService.js
var require_weatherService = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { getJson, validCoordinates } = require_httpJson();
	const { analyzeClimate } = require_climateAnalyzer();
	const createWeatherService = (cache, request = getJson) => async (user) => {
		if (!user.cidade?.trim() || !validCoordinates(user.lat, user.lon)) return null;
		const key = `weather:v3:${user.id}:${user.lat}:${user.lon}`;
		const stored = await cache.read(key);
		if (stored && analyzeClimate(stored, null).available) return stored;
		try {
			const result = await request(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
				latitude: user.lat,
				longitude: user.lon,
				current: "temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
				hourly: "precipitation,precipitation_probability",
				daily: "et0_fao_evapotranspiration",
				timezone: "auto",
				timeformat: "unixtime",
				forecast_days: "2"
			})}`);
			if (!analyzeClimate(result, null).available) return null;
			result.retrievedAt = (/* @__PURE__ */ new Date()).toISOString();
			await cache.write(key, 600, result);
			return result;
		} catch {
			console.warn("[Weather] Fonte indisponível.");
			return null;
		}
	};
	const fetchWeather = (user) => createWeatherService(require__agro_edge_no_legacy_cache())(user);
	module.exports = {
		fetchWeather,
		createWeatherService
	};
}));
// services/satelliteService.js
var require_satelliteService = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { getJson, validCoordinates } = require_httpJson();
	const unavailable = () => ({
		available: false,
		umidadeMacro: null,
		dataReferencia: null,
		fonte: "Indisponível",
		historico: [],
		unit: "relative_saturation_percent"
	});
	const parseSatellite = (json, now = Date.now()) => {
		const rows = Object.entries(json?.properties?.parameter?.GWETTOP || {}).flatMap(([day, value]) => {
			if (!/^\d{8}$/.test(day) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return [];
			const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
			const ms = Date.parse(date + "T00:00:00Z");
			if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date || ms > now || now - ms > 2592e6) return [];
			return [{
				data: date,
				valor: Math.round(value * 100)
			}];
		}).sort((a, b) => a.data.localeCompare(b.data)).slice(-7);
		if (!rows.length) return unavailable();
		const latest = rows.at(-1), ageDays = Math.floor((now - Date.parse(latest.data + "T00:00:00Z")) / 864e5);
		return {
			available: ageDays <= 7,
			stale: ageDays > 7,
			umidadeMacro: ageDays <= 7 ? latest.valor : null,
			dataReferencia: latest.data,
			ageDays,
			fonte: "NASA POWER",
			historico: rows,
			unit: "relative_saturation_percent",
			retrievedAt: new Date(now).toISOString()
		};
	};
	const createSatelliteService = (cache, request = getJson) => async (lat, lon) => {
		if (!validCoordinates(lat, lon)) return unavailable();
		const key = `sat:v3:${lat},${lon}`;
		const stored = await cache.read(key);
		if (stored && Date.now() - Date.parse(stored.retrievedAt) < 432e5 && Date.now() - Date.parse(stored.dataReferencia + "T00:00:00Z") <= 6048e5) return stored;
		try {
			const day = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");
			const params = new URLSearchParams({
				parameters: "GWETTOP",
				community: "AG",
				longitude: lon,
				latitude: lat,
				start: day(Date.now() - 2592e6),
				end: day(Date.now()),
				format: "JSON"
			});
			const result = parseSatellite(await request(`https://power.larc.nasa.gov/api/temporal/daily/point?${params}`));
			if (result.available) await cache.write(key, 43200, result);
			return result;
		} catch {
			console.warn("[NASA] Fonte indisponível.");
			return unavailable();
		}
	};
	const fetchSateliteData = (lat, lon) => createSatelliteService(require__agro_edge_no_legacy_cache())(lat, lon);
	module.exports = {
		fetchSateliteData,
		parseSatellite,
		createSatelliteService
	};
}));
// services/agro4/context.js
var require_context = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { createWeatherService } = require_weatherService();
	const { createSatelliteService } = require_satelliteService();
	const { getJson } = require_httpJson();
	const createContext = (now = Date.now, { signal } = {}) => {
		const values = /* @__PURE__ */ new Map();
		const cache = {
			read: async (key) => {
				const entry = values.get(key);
				if (entry && entry.until > now()) return entry.value;
				values.delete(key);
				return null;
			},
			write: async (key, seconds, value) => {
				if (values.size >= 512) values.delete(values.keys().next().value);
				values.set(key, {
					until: now() + seconds * 1e3,
					value
				});
			}
		};
		const request = (url, options) => getJson(url, {
			...options,
			signal
		});
		const weather = createWeatherService(cache, request), satellite = createSatelliteService(cache, request);
		return async (device) => {
			const user = {
				...device.config,
				id: device.userId
			};
			const [weatherData, satelliteData] = await Promise.all([weather(user), user.cidade?.trim() ? satellite(user.lat, user.lon) : Promise.resolve(null)]);
			return {
				weather: weatherData,
				satellite: satelliteData
			};
		};
	};
	module.exports = { createContext };
}));
// workers/supabase/deadline.mjs
var import_agro4 = /* @__PURE__ */ __toESM(require_agro4(), 1);
var import_agroDb = /* @__PURE__ */ __toESM(require_agroDb(), 1);
var import_repository = /* @__PURE__ */ __toESM(require_repository(), 1);
var import_worker = /* @__PURE__ */ __toESM(require_worker(), 1);
var import_blynk = /* @__PURE__ */ __toESM(require_blynk(), 1);
var import_controlPlane = /* @__PURE__ */ __toESM(require_controlPlane(), 1);
var import_context = /* @__PURE__ */ __toESM(require_context(), 1);
const createDeadlineResources = ({ Pool, now = Date.now, workMs = 9e4, cleanupMs = 1e4 }) => {
	const controller = new AbortController(), finishAt = now() + workMs + cleanupMs, clients = /* @__PURE__ */ new Set();
	let closed = false;
	const closeClients = () => {
		for (const client of [...clients]) client.release(true);
	};
	controller.signal.addEventListener("abort", closeClients, { once: true });
	const workTimer = setTimeout(() => controller.abort(), workMs);
	const finishTimer = setTimeout(() => {
		closed = true;
		closeClients();
	}, workMs + cleanupMs);
	const remaining = () => {
		const value = finishAt - now();
		if (closed || value <= 0) throw Error("AGRO_EDGE_DEADLINE");
		return Math.min(5e3, value);
	};
	class DeadlinePool {
		constructor(options) {
			this.pool = new Pool({
				...options,
				connectionTimeoutMillis: remaining(),
				query_timeout: 5e3,
				statement_timeout: 5e3
			});
		}
		on(...args) {
			return this.pool.on(...args);
		}
		async connect() {
			remaining();
			const native = await this.pool.connect();
			let released = false;
			const client = {
				query: (text, values = []) => {
					if (released) throw Error("AGRO_EDGE_CONNECTION_CLOSED");
					return native.query({
						text,
						values,
						query_timeout: remaining()
					});
				},
				release: (destroy = false) => {
					if (released) return;
					released = true;
					clients.delete(client);
					native.release(destroy);
				}
			};
			try {
				remaining();
				clients.add(client);
				return client;
			} catch (error) {
				client.release(true);
				throw error;
			}
		}
		end() {
			return this.pool.end();
		}
	}
	const http = Object.fromEntries(["get", "post"].map((method) => [method, (url, ...args) => {
		const options = method === "get" ? args[0] || {} : args[1] || {};
		const joined = AbortSignal.any([controller.signal, options.signal].filter(Boolean));
		return method === "get" ? axios.get(url, {
			...options,
			signal: joined
		}) : axios.post(url, args[0], {
			...options,
			signal: joined
		});
	}]));
	const bounded = async (operation) => {
		if (controller.signal.aborted) throw Error("AGRO_EDGE_DEADLINE");
		let abort;
		const cancelled = new Promise((_, reject) => {
			abort = () => reject(Error("AGRO_EDGE_DEADLINE"));
			controller.signal.addEventListener("abort", abort, { once: true });
		});
		try {
			return await Promise.race([operation(), cancelled]);
		} finally {
			controller.signal.removeEventListener("abort", abort);
		}
	};
	return {
		DeadlinePool,
		http,
		bounded,
		signal: controller.signal,
		shouldContinue: () => !controller.signal.aborted,
		dispose: () => {
			clearTimeout(workTimer);
			clearTimeout(finishTimer);
			controller.signal.removeEventListener("abort", closeClients);
		}
	};
};
// workers/supabase/core-entry.mjs
const runShadowCycle = async ({ Pool, databaseUrl, workerSecret, workerApiUrl, now = Date.now }) => {
	const resources = createDeadlineResources({
		Pool,
		now
	});
	const config = import_agro4.default.readConfig({
		AGRO4_MODE: "shadow",
		AGRO_DATABASE_URL: databaseUrl,
		AGRO_DATABASE_ACK: "dedicated-agro",
		AGRO_WORKER_SECRET: workerSecret,
		...workerApiUrl ? { AGRO_WORKER_API_URL: workerApiUrl } : {}
	});
	const pool = import_agroDb.default.createAgroPool(config, resources.DeadlinePool);
	try {
		const repository = new import_repository.default.AgroRepository(pool);
		const context = import_context.default.createContext(now, { signal: resources.signal });
		const counters = await import_worker.default.createWorker({
			repository,
			config,
			now,
			shouldContinue: resources.shouldContinue,
			source: import_blynk.default.createBlynkSource({
				baseUrl: config.blynkServerUrl,
				timeoutMs: config.timeoutMs,
				retries: config.retries,
				http: resources.http
			}),
			context: (device) => resources.bounded(() => context(device)),
			resolveDevice: workerApiUrl ? import_controlPlane.default.createControlPlane({
				url: workerApiUrl,
				secret: workerSecret,
				http: resources.http
			}) : async () => {
				throw Error("AGRO_CONTROL_API_NOT_CONFIGURED");
			},
			sendAlert: async () => {
				throw Error("AGRO_EDGE_SHADOW_ONLY");
			},
			log: () => console.warn("[Agro Edge] Dispositivo indisponível para processamento.")
		}).runOnce();
		return {
			mode: "shadow",
			controlApiConfigured: !!workerApiUrl,
			timeBudgetReached: !resources.shouldContinue(),
			counters
		};
	} finally {
		try {
			await pool.end();
		} finally {
			resources.dispose();
		}
	}
};
export { runShadowCycle };
