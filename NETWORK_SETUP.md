# iMath — Hướng dẫn truy cập qua mạng nội bộ

## Yêu cầu
- Tất cả thiết bị phải kết nối **cùng một mạng WiFi**
- Node.js đã cài trên máy chủ (máy tính bàn/laptop)

---

## Bước 1 — Mở cổng tường lửa (chỉ làm một lần)

1. Tìm file `scripts/setup-firewall.bat` trong thư mục dự án
2. Nhấp chuột phải → **"Run as administrator"**
3. Xác nhận khi Windows hỏi quyền
4. Đợi thông báo thành công rồi đóng cửa sổ

> Chỉ cần làm bước này **một lần duy nhất** trên máy chủ.

---

## Bước 2 — Cài đặt lần đầu

Mở terminal tại thư mục gốc của dự án (`imath/`) và chạy:

```bash
npm install
```

---

## Bước 3 — Khởi động ứng dụng

```bash
npm start
```

Khi khởi động, màn hình sẽ hiện địa chỉ IP:

```
==========================================
  iMath - Truy cập qua mạng nội bộ
==========================================
  Từ MÁY NÀY:
    http://localhost:3000

  Từ thiết bị KHÁC (máy tính bảng, điện thoại):
    http://192.168.1.x:3000

  Đảm bảo tất cả thiết bị cùng mạng WiFi!
==========================================
```

---

## Bước 4 — Truy cập từ thiết bị khác

1. Lấy địa chỉ IP hiển thị ở bước 3 (ví dụ: `192.168.1.5`)
2. Trên máy tính bảng hoặc điện thoại, mở trình duyệt
3. Nhập địa chỉ: `http://192.168.1.5:3000`
4. Bắt đầu học toán!

> **Mẹo:** Dùng trang web tạo mã QR miễn phí (ví dụ: qr-code-generator.com) để tạo QR từ địa chỉ IP — trẻ em chỉ cần quét mã là vào được!

---

## Tìm IP thủ công (nếu cần)

**Windows:**
```
ipconfig
```
Tìm dòng `IPv4 Address` trong phần WiFi adapter.

**Mac / Linux:**
```
ifconfig
```
Tìm địa chỉ `inet` không phải `127.0.0.1`.

---

## Xử lý sự cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Thiết bị khác không vào được | Kiểm tra đã chạy `setup-firewall.bat` với quyền Administrator chưa |
| Không hiện IP | Đảm bảo máy chủ đã kết nối WiFi (không dùng mạng dây) |
| Cổng bị chiếm | Tắt ứng dụng khác đang dùng cổng 3000 hoặc 3001 |
| Thiết bị khác vào được frontend nhưng không lưu điểm | Kiểm tra cổng **3001** cũng đã được mở trong tường lửa |
