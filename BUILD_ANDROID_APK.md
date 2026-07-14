# ساخت و نصب APK اندروید TradeLog

این نسخه برای نصب مستقیم روی گوشی اندرویدی آماده شده است و به Expo Go نیاز ندارد.

## فقط این 4 دستور را در Windows Terminal یا CMD، داخل پوشه پروژه اجرا کنید

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

- در مرحله `login` با حساب Expo خود وارد شوید یا یک حساب رایگان بسازید.
- در مرحله `build:configure`، گزینه‌های پیش‌فرض را تأیید کنید.
- هنگام پرسش درباره Android Keystore، گزینه ساخت Keystore جدید را تأیید کنید.
- بعد از تکمیل Build، EAS یک لینک می‌دهد. لینک را روی همان گوشی اندرویدی باز و فایل APK را نصب کنید.

## نکته نصب

اندروید ممکن است هنگام نصب APK خارج از Play Store اجازه نصب از مرورگر یا Files را بخواهد. فقط برای همان مرورگر/فایل‌منیجر، گزینه `Allow from this source` را فعال کنید، نصب را انجام دهید و در صورت تمایل دوباره غیرفعالش کنید.

## اطلاعات Build

- خروجی `preview`: APK قابل نصب مستقیم روی گوشی
- شناسه برنامه: `com.tradelog.app`
- نسخه: `1.0.0` / Version Code: `1`

برای انتشار در Google Play از پروفایل `production` استفاده می‌شود که خروجی AAB می‌سازد و مستقیم روی گوشی نصب نمی‌شود.
