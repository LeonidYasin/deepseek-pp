package com.deepseek;

import android.os.Bundle;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import android.content.SharedPreferences;
import android.view.View;
import java.io.IOException;
import okhttp3.*;
import org.json.JSONObject;

public class SettingsActivity extends AppCompatActivity {
    
    private EditText mcpServerUrl;
    private EditText githubToken;
    private Spinner injectionStrategy;
    private TextView statusText;
    private SharedPreferences prefs;
    private OkHttpClient client;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        
        prefs = getSharedPreferences("DeepSeekPP", MODE_PRIVATE);
        client = new OkHttpClient();
        
        mcpServerUrl = findViewById(R.id.mcpServerUrl);
        githubToken = findViewById(R.id.githubToken);
        injectionStrategy = findViewById(R.id.injectionStrategy);
        statusText = findViewById(R.id.statusText);
        
        // Setup spinner
        ArrayAdapter<CharSequence> adapter = ArrayAdapter.createFromResource(this,
            R.array.injection_strategies, android.R.layout.simple_spinner_item);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        injectionStrategy.setAdapter(adapter);
        
        // Load saved settings
        loadSettings();
        
        // Save button
        findViewById(R.id.saveButton).setOnClickListener(v -> saveSettings());
        
        // Test connection button
        findViewById(R.id.testConnectionButton).setOnClickListener(v -> testConnection());
    }
    
    private void loadSettings() {
        String url = prefs.getString("mcp_server_url", "http://localhost:3000/mcp");
        String token = prefs.getString("github_token", "");
        int strategy = prefs.getInt("injection_strategy", 0);
        
        mcpServerUrl.setText(url);
        githubToken.setText(token);
        injectionStrategy.setSelection(strategy);
    }
    
    private void saveSettings() {
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("mcp_server_url", mcpServerUrl.getText().toString());
        editor.putString("github_token", githubToken.getText().toString());
        editor.putInt("injection_strategy", injectionStrategy.getSelectedItemPosition());
        editor.apply();
        
        Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show();
        statusText.setText("✅ Settings saved");
    }
    
    private void testConnection() {
        String url = mcpServerUrl.getText().toString();
        statusText.setText("⏳ Testing connection...");
        
        JSONObject request = new JSONObject();
        try {
            request.put("jsonrpc", "2.0");
            request.put("method", "initialize");
            request.put("id", System.currentTimeMillis());
            
            JSONObject params = new JSONObject();
            params.put("protocolVersion", "0.1.0");
            params.put("capabilities", new JSONObject());
            request.put("params", params);
        } catch (Exception e) {
            statusText.setText("❌ Error: " + e.getMessage());
            return;
        }
        
        RequestBody body = RequestBody.create(
            request.toString(),
            MediaType.parse("application/json")
        );
        
        Request httpRequest = new Request.Builder()
            .url(url)
            .post(body)
            .build();
        
        client.newCall(httpRequest).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    statusText.setText("❌ Connection failed: " + e.getMessage());
                });
            }
            
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body().string();
                runOnUiThread(() -> {
                    if (response.isSuccessful()) {
                        statusText.setText("✅ MCP Server online!");
                        Toast.makeText(SettingsActivity.this, "Connected successfully!", Toast.LENGTH_SHORT).show();
                    } else {
                        statusText.setText("⚠️ Server responded with code: " + response.code());
                    }
                });
            }
        });
    }
}
