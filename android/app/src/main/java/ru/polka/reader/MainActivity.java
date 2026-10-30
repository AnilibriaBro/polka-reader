package ru.polka.reader;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // «Поделиться → Полка» превращаю в «Открыть с помощью → Полка»: дальше книгу принимает
    // одна и та же часть приложения (src/openWith.ts)
    // "Share → Polka" becomes "Open with → Polka", so one part of the app (src/openWith.ts) handles both
    private static void normalize(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                intent.setAction(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, intent.getType());
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        normalize(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        normalize(intent);
        super.onNewIntent(intent);
    }
}
