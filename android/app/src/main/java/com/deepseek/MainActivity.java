package com.deepseek;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.content.SharedPreferences;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.firebase.auth.FirebaseAuth;
import okhttp3.*;
import org.json.JSONObject;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {
    
    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private SharedPreferences prefs;
    private OkHttpClient httpClient;
    private String mcpServerUrl;
    private GoogleSignInClient googleSignInClient;
    private FirebaseAuth firebaseAuth;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        
        // Initialize Google Sign-In
        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .build();
        googleSignInClient = GoogleSignIn.getClient(this, gso);
        firebaseAuth = FirebaseAuth.getInstance();
        
        prefs = getSharedPreferences("DeepSeekPP", MODE_PRIVATE);
        mcpServerUrl = prefs.getString("mcp_server_url", "http://10.0.2.2:3000/mcp");
        
        httpClient = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();
        
        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        
        setupWebView();
        setupSwipeRefresh();
        
        // Load DeepSeek with user info
        String url = "https://chat.deepseek.com";
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(this);
        if (account != null) {
            // Add user info to URL (if DeepSeek supports it)
            url = "https://chat.deepseek.com?email=" + account.getEmail();
        }
        webView.loadUrl(url);
    }
    
    private void setupWebView() {
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);
                injectMCPBridge();
                injectUserCredentials();
            }
            
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Toast.makeText(MainActivity.this, "Error: " + description, Toast.LENGTH_SHORT).show();
            }
        });
        
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new MCPBridge(), "AndroidMCP");
    }
    
    private void injectUserCredentials() {
        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(this);
        if (account != null) {
            String jsCode = 
                "(function() {" +
                "    console.log('Injecting Google user: " + account.getEmail() + "');" +
                "    // Try to auto-fill login form if present" +
                "    var emailInput = document.querySelector('input[type=\"email\"]');" +
                "    if (emailInput) {" +
                "        emailInput.value = '" + account.getEmail() + "';" +
                "        emailInput.dispatchEvent(new Event('input', { bubbles: true }));" +
                "    }" +
                "})();";
            webView.evaluateJavascript(jsCode, null);
        }
    }
    
    private void injectMCPBridge() {
        String jsCode = 
            "(function() {" +
            "    if (window.mcpBridge) return;" +
            "    window.mcpBridge = {" +
            "        callMCP: function(method, params) {" +
            "            return new Promise((resolve, reject) => {" +
            "                AndroidMCP.callMCP(method, JSON.stringify(params), resolve.toString());" +
            "            });" +
            "        }" +
            "    };" +
            "    console.log('MCP Bridge injected');" +
            "})();";
        
        webView.evaluateJavascript(jsCode, null);
    }
    
    private void setupSwipeRefresh() {
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
        swipeRefresh.setColorSchemeResources(android.R.color.holo_blue_dark);
    }
    
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.main_menu, menu);
        return true;
    }
    
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_settings) {
            Intent intent = new Intent(this, SettingsActivity.class);
            startActivity(intent);
            return true;
        } else if (id == R.id.action_reload) {
            webView.reload();
            return true;
        } else if (id == R.id.action_clear_cache) {
            webView.clearCache(true);
            Toast.makeText(this, "Cache cleared", Toast.LENGTH_SHORT).show();
            return true;
        } else if (id == R.id.action_sign_out) {
            signOut();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
    
    private void signOut() {
        googleSignInClient.signOut().addOnCompleteListener(this, task -> {
            firebaseAuth.signOut();
            Toast.makeText(this, "Signed out", Toast.LENGTH_SHORT).show();
            recreate();
        });
    }
    
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        mcpServerUrl = prefs.getString("mcp_server_url", "http://10.0.2.2:3000/mcp");
        injectMCPBridge();
    }
    
    private class MCPBridge {
        @JavascriptInterface
        public void callMCP(String method, String paramsJson, final String callbackId) {
            runOnUiThread(() -> {
                try {
                    JSONObject request = new JSONObject();
                    request.put("jsonrpc", "2.0");
                    request.put("method", method);
                    request.put("id", System.currentTimeMillis());
                    
                    if (paramsJson != null && !paramsJson.isEmpty()) {
                        request.put("params", new JSONObject(paramsJson));
                    } else {
                        request.put("params", new JSONObject());
                    }
                    
                    RequestBody body = RequestBody.create(
                        request.toString(),
                        MediaType.parse("application/json")
                    );
                    
                    Request httpRequest = new Request.Builder()
                        .url(mcpServerUrl)
                        .post(body)
                        .build();
                    
                    httpClient.newCall(httpRequest).enqueue(new Callback() {
                        @Override
                        public void onFailure(Call call, IOException e) {
                            final String error = "MCP Error: " + e.getMessage();
                            webView.evaluateJavascript(
                                "window.__mcpCallback && window.__mcpCallback('" + callbackId + "', null, '" + error + "')",
                                null
                            );
                        }
                        
                        @Override
                        public void onResponse(Call call, Response response) throws IOException {
                            String responseBody = response.body().string();
                            final String result = responseBody;
                            webView.evaluateJavascript(
                                "window.__mcpCallback && window.__mcpCallback('" + callbackId + "', '" + result.replace("'", "\\'") + "', null)",
                                null
                            );
                        }
                    });
                } catch (Exception e) {
                    webView.evaluateJavascript(
                        "window.__mcpCallback && window.__mcpCallback('" + callbackId + "', null, '" + e.getMessage() + "')",
                        null
                    );
                }
            });
        }
    }
}
