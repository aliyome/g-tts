import { readFileSync, writeFileSync } from "node:fs";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

/// text2mp3 は入力された文字列をGCPのCloudTTSに投げて音声に変換します
/// 各種設定は個人的に聞きやすい設定にしています。
/// 速度はプレイヤー側で調整するので等倍です。
const text2mp3 = async (text: string) => {
	if (text.length >= 5000) {
		throw new Error("5000文字以内の文字列のみ変換できます");
	}
	const client = new TextToSpeechClient();
	const [res] = await client.synthesizeSpeech({
		audioConfig: {
			audioEncoding: "MP3",
			// pitch: -2.0,
			speakingRate: 1.0,
		},
		input: { text },
		voice: { languageCode: "ja-JP", name: "ja-JP-Chirp3-HD-Rasalgethi" },
	});
	return res.audioContent;
};

const HARD_BOUNDARY_REGEX = /(?<=[。．？！?!\n])/;
const SOFT_BOUNDARY_REGEX = /(?<=[、，,])/;

const hardSplit = (segment: string, limit: number) => {
	const chunks: string[] = [];
	for (let i = 0; i < segment.length; i += limit) {
		chunks.push(segment.slice(i, i + limit));
	}
	return chunks;
};

const splitWithSoftBoundaries = (segment: string, limit: number) => {
	if (segment.length <= limit) {
		return [segment];
	}
	const softParts = segment.split(SOFT_BOUNDARY_REGEX);
	if (softParts.length === 1) {
		return hardSplit(segment, limit);
	}
	const chunks: string[] = [];
	let buffer = "";
	for (const part of softParts) {
		if (!part) {
			continue;
		}
		if (part.length > limit) {
			if (buffer) {
				chunks.push(buffer);
				buffer = "";
			}
			chunks.push(...hardSplit(part, limit));
			continue;
		}
		if (buffer.length + part.length <= limit) {
			buffer = buffer.concat(part);
		} else {
			chunks.push(buffer);
			buffer = part;
		}
	}
	if (buffer) {
		chunks.push(buffer);
	}
	return chunks;
};

/// splitTextToNChars は句読点と改行を優先しつつn文字以内で分割します。
const splitTextToNChars = (text: string, n: number) => {
	const normalized = text.replace(/\r\n?/g, "\n");
	const rawSegments = normalized.split(HARD_BOUNDARY_REGEX);
	const sentences: string[] = [];
	let buffer = "";

	for (const raw of rawSegments) {
		const segment = raw.replace(/^[ \t]+/, "");
		if (!segment) {
			continue;
		}
		const pieces = splitWithSoftBoundaries(segment, n);
		for (const piece of pieces) {
			if (!piece) {
				continue;
			}
			const chunk = piece;
			if (buffer.length === 0) {
				buffer = chunk;
				continue;
			}
			if (buffer.length + chunk.length <= n) {
				buffer = buffer.concat(chunk);
			} else {
				sentences.push(buffer.trim());
				buffer = chunk;
			}
		}
	}
	if (buffer) {
		sentences.push(buffer.trim());
	}
	return sentences.filter((sentence) => sentence.length > 0);
};

const main = async () => {
	if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		console.error(
			"環境変数 GOOGLE_APPLICATION_CREDENTIALS にGCPのサービスアカウントキーのパスを設定してください。",
		);
		process.exit(1);
	}
	if (process.argv.length <= 2) {
		console.error("引数にテキストファイルのパスを指定してください。");
		process.exit(1);
	}

	// const client = new TextToSpeechClient();
	// const res = await client.listVoices({ languageCode: "ja-JP" });
	// console.dir({ res }, { depth: null });

	const paths = process.argv.slice(2);
	console.log(paths);

	for (const path of paths) {
		const filename = path.replace(/\..*$/, "");
		const text = readFileSync(path, { encoding: "utf8" });
		const sentences = splitTextToNChars(text, 1500);
		for (let i = 0; i < sentences.length; i++) {
			const sentence = sentences[i];
			console.log(i, sentence);
			const mp3 = await text2mp3(sentence);
			if (!mp3) {
				throw new Error("音声データの取得に失敗しました");
			}
			const seq = i.toString().padStart(3, "0");
			const mp3FileName = `${filename}-${seq}.mp3`;
			writeFileSync(mp3FileName, mp3, "binary");
			console.log(`output ${mp3FileName}`);
		}
	}
};

main().catch(console.error);
