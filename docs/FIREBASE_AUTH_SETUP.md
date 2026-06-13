# Firebase 認証セットアップ（Google ログイン）

プロジェクト: **handwriting-grader-karte**

## 現状（API で確認済み）

- **承認済みドメイン** に `localhost` は **登録済み**
- Identity Toolkit API は **有効**
- フロントの `.env.local` の Firebase 設定は **読み込まれている**

それでもログインできない場合、以下 **② Google ログインの有効化** と **③ OAuth クライアント** が未設定のことが多いです。

---

## ① Firebase コンソールを開く

[Authentication（認証）](https://console.firebase.google.com/project/handwriting-grader-karte/authentication)

---

## ② Google ログインを有効化

1. **Sign-in method（ログイン方法）** タブ
2. **Google** をクリック
3. **有効にする** を ON
4. **プロジェクトのサポートメール** を選択
5. **保存**

---

## ③ Google Cloud の OAuth クライアント（重要）

Firebase で Google を有効にすると、Google Cloud に Web クライアントが自動作成されます。

1. [Google Cloud Console → 認証情報](https://console.cloud.google.com/apis/credentials?project=handwriting-grader-karte)
2. **OAuth 2.0 クライアント ID** のうち **Web client (auto created by Google Service)** を開く
3. **Authorized JavaScript origins（承認済みの JavaScript 生成元）** に以下があるか確認し、なければ追加:

   ```
   http://localhost:5173
   http://localhost
   ```

4. **Authorized redirect URIs（承認済みのリダイレクト URI）** に以下があるか確認:

   ```
   https://handwriting-grader-karte.firebaseapp.com/__/auth/handler
   ```

5. **保存**

---

## ④ 承認済みドメイン（通常は不要）

[Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/handwriting-grader-karte/authentication/settings)

次が含まれていれば OK（通常 `localhost` は最初から入っています）:

- `localhost`
- `handwriting-grader-karte.firebaseapp.com`

**注意:** `127.0.0.1` は別ドメイン扱いのため、ログイン URL は必ず **`http://localhost:5173`** を使ってください。

---

## ⑤ API キーの HTTP リファラー制限（本番ログインで重要）

[Google Cloud → 認証情報 → API キー](https://console.cloud.google.com/apis/credentials?project=handwriting-grader-karte)

**Browser key (auto created by Firebase)** に **HTTP リファラー制限** がある場合、次を含めてください:

```
https://handwriting-grader-karte.web.app/*
https://handwriting-grader-karte.firebaseapp.com/*
http://localhost:5173/*
http://localhost/*
```

本番で `auth/requests-from-referer-https://handwriting-grader-karte.web.app-are-blocked.` が出る場合、**リファラーに `.web.app` が入っていない**ことがほとんどです（承認済みドメインとは別設定）。

一括更新:

```bash
bash scripts/setup-firebase-api-key-referrers.sh
```

制限が原因か切り分けるには、一時的に **制限なし** にしてログインを試してください。

---

## ⑥ Firestore ルールのデプロイ

```bash
cd /Users/Alan/Projects/handwriting-grader-karte
firebase deploy --only firestore:rules,storage:rules
```

ログイン後に `teachers/{uid}` ドキュメントを作成するため、ルール未デプロイだと書き込みエラーになることがあります。

---

## ⑦ ローカル起動

```bash
# ターミナル 1: バックエンド
cd backend && source .venv/bin/activate && python3 run.py

# ターミナル 2: フロント
cd frontend && npm run dev
```

- アプリ: **http://localhost:5173/login**
- ブラウザ: **Chrome または Safari**（Cursor 内蔵ブラウザは Google ログインで失敗しやすい）

---

## よくあるエラー

| エラー | 対処 |
|--------|------|
| `auth/unauthorized-domain` | `localhost:5173` で開く（127.0.0.1 不可） |
| `auth/requests-from-referer-...-are-blocked` | ⑤ API キーの HTTP リファラーに `.web.app` / `.firebaseapp.com` を追加 |
| `auth/operation-not-allowed` | ② Google ログインを有効化 |
| `auth/popup-blocked` | ポップアップ許可、または Chrome/Safari を使用 |
| ログイン後真っ白 / データが出ない | ⑥ ルールをデプロイ |
