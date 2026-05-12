# MAGI SYSTEM

3つのAI人格が、相談内容をそれぞれの判断基準で分析し、「承認」または「否定」を提出するローカルWebアプリです。最終決議は多数決で決まります。

- ROMANTIC: ロマンチストとしての人格
- RATIONAL: 理性としての人格
- ENTERTAINER: エンターテイナーとしての人格

## 起動

```bash
node server.js
```

ブラウザで `http://localhost:4173` を開きます。

## OpenAI APIを使う

APIキーを環境変数に入れて起動します。キーはブラウザへ送られず、`server.js` の中だけで使われます。

```bash
OPENAI_API_KEY=sk-... node server.js
```

モデルを変えたい場合:

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-5.4-mini node server.js
```

APIキーがない場合は、画面確認用のデモ判定で動きます。

`.env` に書くこともできます。

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

`.env.example` を `.env` にコピーして、`OPENAI_API_KEY` を自分のキーに置き換えてください。
