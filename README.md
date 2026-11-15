<p align="center"><img src="docs/assets/stillhere-logo-transparent.png" width="250" alt="StillHere – Unsend Message Viewer"></p>

# StillHere – Unsend Message Viewer

**Xem lại nội dung đã được lưu trước khi tin nhắn bị thu hồi trên Zalo Web và Facebook/Messenger.**

StillHere là tiện ích Chrome miễn phí, do **FSUB.vn - Digital Marketing Solutions** quản lý và phát triển. Bản lưu được mã hoá và giữ trong hồ sơ Chrome trên thiết bị của bạn.

[Cài từ Chrome Web Store](https://chromewebstore.google.com/detail/donbagfnihbongdgfgakelanobimbklm) · [Quyền riêng tư](https://pcodejs.github.io/StillHere/privacy.html) · [Privacy policy](https://pcodejs.github.io/StillHere/privacy-en.html) · [Lịch sử cập nhật](https://pcodejs.github.io/StillHere/changelog.html)

## Bạn có thể làm gì?

- Lưu văn bản, tên, avatar và thông tin hội thoại đã được trang tải để đọc lại khi phát hiện thu hồi.
- Xem ảnh, video, GIF và nhãn dán thuộc định dạng hỗ trợ khi tệp đã tải thành công trước lúc bị gỡ.
- Đọc trong tiện ích hoặc ngay cạnh tin thu hồi trên nền tảng khi đang mở khoá và bật lưu.
- Chọn Zalo, Facebook hoặc cả hai; chỉ xin quyền trang và CDN tương ứng với lựa chọn.
- Tự kết nối tab đang mở sau khi được cấp quyền, không cần làm mới trang.
- Tiếp tục mã hoá tin mới khi đang khoá, sau khi đã thiết lập mật khẩu và bật tự lưu.
- Tìm kiếm, lọc, đánh dấu quan trọng và ghi chú riêng trên máy; xuất dữ liệu theo thao tác chủ động.
- Dùng giao diện tiếng Việt hoặc English, tạm dừng lưu và xoá dữ liệu trong Cài đặt.

## Giới hạn cần hiểu

StillHere **không khôi phục được tin đã gỡ trước khi tiện ích kịp lưu**. Có tab đang mở không có nghĩa mọi cuộc trò chuyện đều đã được tải hoặc ghi nhận. Tiện ích xử lý nội dung mà giao diện nền tảng đã tải; Chrome có thể tạm ngưng thẻ nền. Tệp cần tải xong trước khi thu hồi; một số video chỉ có ảnh xem trước.

Mặc định giữ dữ liệu 30 ngày, có lựa chọn 7 ngày. Kho tệp tối đa 100 MB, mỗi tệp tối đa 20 MB; metadata tối đa 1.500 tin hoặc khoảng 4 MB. Dữ liệu hết hạn hoặc vượt giới hạn được dọn theo chính sách. Giao diện các nền tảng thay đổi có thể ảnh hưởng khả năng nhận diện.

## Bắt đầu sử dụng

1. Cài tiện ích, tạo mật khẩu StillHere và giữ mật khẩu cẩn thận.
2. Chọn nền tảng, cấp quyền trong hộp thoại Chrome và bật tự lưu.
3. Đăng nhập Zalo Web hoặc Facebook/Messenger, mở hội thoại cần theo dõi.
4. Xem mục **Kết nối** để biết tab, quyền và việc ghi nhận có đang hoạt động hay không.
5. Khi có tin đã thu hồi, mở StillHere để xem bản đã lưu.

Phiên mở khoá được giữ đến khi bạn thoát hoàn toàn Chrome. Tải lại tiện ích hoặc phát hiện đăng xuất/đổi tài khoản cũng có thể kết thúc phiên. Nhà phát triển không thể khôi phục mật khẩu. Những người dùng chung hồ sơ Chrome có thể dùng chung kho và mật khẩu; hãy dùng hồ sơ riêng.

## Quyền riêng tư và bảo mật

Nội dung và tệp lưu trên máy được mã hoá AES-256-GCM; khoá từ mật khẩu dùng PBKDF2-SHA-256, 600.000 vòng. Lưu khi khoá dùng mã hoá khoá công khai; khoá giải mã được bảo vệ bằng mật khẩu. Tiện ích không đọc mật khẩu nền tảng, cookie đăng nhập hoặc khoá E2EE. Nội dung E2EE chỉ được ghi nhận sau khi nền tảng giải mã và hiển thị cho bạn.

Tải avatar/tệp cần kết nối tới CDN được cấp quyền. Bản lưu tin nhắn không được gửi về máy chủ của FSUB hay GitHub. Xem [chính sách đầy đủ](https://pcodejs.github.io/StillHere/privacy.html) về quyền, kết nối mạng, lưu trữ và xoá dữ liệu.

## Dựng từ mã nguồn

Cần Node.js 20 trở lên, npm và Python 3 nếu muốn đóng gói ZIP. Chrome tối thiểu 120.

```sh
git clone https://github.com/pcodejs/StillHere.git
cd StillHere
npm ci
npm run build
npm test
npm run check
python3 scripts/package.py
```

Mở `chrome://extensions`, bật chế độ nhà phát triển, chọn **Tải tiện ích đã giải nén** và chọn thư mục `outputs/go-lai-extension`. Gói tải lên Store là `outputs/stillhere-0.7.8-chrome.zip`.

Các bài kiểm thử trình duyệt dùng Playwright Chromium và dữ liệu giả lập:

```sh
npx playwright install chromium
node tests/browser.mjs
node tests/locked-media-browser.mjs
node tests/ui-browser.mjs
```

Kiểm thử giả lập kiểm tra logic và lỗi hồi quy; việc xác minh trên Zalo/Facebook thật vẫn là bước riêng. Không dùng tài khoản hoặc dữ liệu cá nhân trong issue và fixture.

## Cấu trúc mã

| Thư mục | Nội dung |
| --- | --- |
| `src/core` | Chuẩn hoá tin, mã hoá, kho dữ liệu, quyền, trạng thái và bản phát hành |
| `src/background.js` | Điều phối lưu, phiên mở khoá, tải tệp và kết nối tab |
| `src/content.js`, `src/messenger-content.js` | Đọc nội dung đã tải và hiển thị bản lưu trong hội thoại |
| `src/popup` | UI React/Mantine, Tabler icons, VI/EN và chính sách nhúng |
| `tests` | Unit test và bài trình duyệt với dữ liệu mẫu |
| `scripts` | Dựng, kiểm tra và đóng gói |
| `docs` | Chính sách VI/EN và changelog công khai trên GitHub Pages |

## Đóng góp và báo lỗi

Mời bạn tạo issue hoặc pull request, mô tả nền tảng, phiên bản Chrome/StillHere, bước tái hiện và kết quả mong đợi. Hãy che tên, ảnh, nội dung hội thoại và địa chỉ tệp riêng tư trước khi đính kèm ảnh chụp. Không gửi mật khẩu, token, cookie hay bản xuất hội thoại.

Vấn đề bảo mật hoặc thông tin riêng tư: [contact.nguyenxuanphu@gmail.com](mailto:contact.nguyenxuanphu@gmail.com).

## Ủng hộ phát triển StillHere

Nếu bạn thích dự án, bạn có thể ủng hộ để chúng tôi tiếp tục bảo trì, sửa lỗi và phát triển StillHere. **Hoàn toàn tự nguyện, không mở khoá tính năng; StillHere vẫn miễn phí.**

<img src="docs/assets/support-qr.png" width="230" alt="VietQR MB Bank ủng hộ StillHere">

| Thông tin | Giá trị |
| --- | --- |
| Ngân hàng | MB Bank |
| Số tài khoản | **192198** |
| Chủ tài khoản | **NGUYEN XUAN PHU** |
| Nội dung gợi ý | **UNG HO StillHere** |

Bạn tự chọn số tiền và kiểm tra người nhận trong ứng dụng ngân hàng. Mã QR được đóng gói sẵn; StillHere không thực hiện giao dịch hoặc theo dõi khoản ủng hộ.

Bạn cũng có thể đồng hành bằng cách star repository, góp ý và theo dõi:

- [StillHere trên Facebook](https://www.facebook.com/profile.php?id=61596131866684)
- [FSUB.vn trên Facebook](https://www.facebook.com/fsub.vn/)

## Đơn vị phát triển

**FSUB.vn - Digital Marketing Solutions** quản lý và phát triển StillHere, đồng thời cung cấp giải pháp truyền thông mạng xã hội cho doanh nghiệp. [Khám phá dịch vụ FSUB.vn](https://fsub.vn/) hoặc [liên hệ tư vấn](mailto:contact.nguyenxuanphu@gmail.com).

StillHere là sản phẩm độc lập, không thuộc và không được Zalo/VNG hay Meta bảo trợ. Các nhãn hiệu nền tảng thuộc chủ sở hữu tương ứng.

## Giấy phép

Mã nguồn được phát hành theo [MIT License](LICENSE), cho phép sử dụng, chỉnh sửa, phân phối và sử dụng thương mại với điều kiện giữ thông báo bản quyền và giấy phép. Các thư viện, font và tài sản bên thứ ba giữ giấy phép/nhãn hiệu riêng; xem [THIRD-PARTY-NOTICES](src/THIRD-PARTY-NOTICES.txt).
