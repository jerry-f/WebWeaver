vcl 4.1;

backend imgproxy {
    .host = "imgproxy";
    .port = "8080";
}

sub vcl_recv {
    # 缓存所有图片请求
    return (hash);
}

sub vcl_backend_response {
    # 强制缓存图片，忽略后端的 Cache-Control: private
    if (beresp.http.content-type ~ "image/") {
        # 移除 private 标记，设置为可缓存
        unset beresp.http.Cache-Control;
        set beresp.http.Cache-Control = "public, max-age=604800";
        
        # 设置 Varnish TTL
        set beresp.ttl = 7d;
        set beresp.grace = 1d;
        
        # 移除不需要的头
        unset beresp.http.set-cookie;
        
        # 标记为可缓存
        set beresp.uncacheable = false;
    }
}

sub vcl_deliver {
    # 添加缓存命中标识
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
        set resp.http.X-Cache-Hits = obj.hits;
    } else {
        set resp.http.X-Cache = "MISS";
    }
}
