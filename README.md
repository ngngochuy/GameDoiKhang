# 🔐 Game Giải Mã Số — Đối Kháng Real-time

> Game đối kháng 2 người chơi theo phong cách Mastermind. Đoán số bí mật của đối thủ qua kết nối Real-time.

## 🎮 Tính năng

- **Đối kháng Real-time** — 2 người chơi cùng lúc qua Firebase Realtime Database
- **Phòng chơi 3 chữ số** — Tạo phòng & chia sẻ mã để bạn bè tham gia
- **Mastermind Logic** — Phản hồi 🟢 đúng vị trí / 🟡 đúng số sai vị trí
- **Timer 30 giây** — Đếm ngược mỗi lượt, tự động submit khi hết giờ
- **Mobile-first UI** — Tối ưu cho điện thoại, bàn phím số, input OTP-style
- **Không cần đăng nhập** — Chơi ngay, session lưu trên máy

## 📱 Screenshots

| Lobby | Game Board |
|-------|-----------|
| ![Lobby](https://via.placeholder.com/200x400?text=Lobby) | ![Game](https://via.placeholder.com/200x400?text=Game) |

## 🚀 Cách chơi

1. Mở trang web game
2. **Người chơi 1**: Bấm "Tạo Phòng Mới" → nhận mã phòng 3 chữ số
3. **Người chơi 2**: Nhập mã phòng → bấm "Vào Phòng"
4. Cả 2 đặt **số bí mật 4 chữ số** của mình
5. Luân phiên đoán số đối thủ — ai giải mã trước thắng!

### Kết quả mỗi lượt

| Ký hiệu | Ý nghĩa |
|----------|---------|
| 🟢 Xanh | Đúng số, đúng vị trí |
| 🟡 Vàng | Đúng số, sai vị trí |

## 🛠️ Cài đặt

### 1. Clone repo

```bash
git clone https://github.com/ngngochuy/GameDoiKhang.git
cd GameDoiKhang
```

### 2. Cấu hình Firebase

Mở `game.js`, thay thế `firebaseConfig` (dòng 8-16) bằng config từ [Firebase Console](https://console.firebase.google.com/):

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxx"
};
```

### 3. Firebase Database Rules

Trong Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

### 4. Chạy

Mở `index.html` trực tiếp trong trình duyệt hoặc dùng local server:

```bash
npx serve .
```

## 📂 Cấu trúc

```
GameDoiKhang/
├── index.html    # Giao diện chính (Tailwind CSS CDN)
├── style.css     # Custom styles, animations
├── game.js       # Logic game, Firebase real-time
└── README.md
```

## 🔧 Tech Stack

- **HTML5** + **Tailwind CSS** (CDN)
- **Firebase Realtime Database** (v9 compat)
- **Vanilla JavaScript**

## 📄 License

MIT © [ngngochuy](https://github.com/ngngochuy)
