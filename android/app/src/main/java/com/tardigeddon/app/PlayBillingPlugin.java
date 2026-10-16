package com.tardigeddon.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClient.BillingResponseCode;
import com.android.billingclient.api.BillingClient.ProductType;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;

/**
 * Google Play Billing for coin packs (src/shop/playBilling.ts is the other half).
 * The app only starts purchases and reports their tokens: the game server checks
 * each one with Google, grants the coins, and consumes it (server/googlePlay.ts).
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private boolean connecting = false;
    /** Calls waiting for the connection, and what each does once connected. */
    private final List<PluginCall> waitingCalls = new ArrayList<>();
    private final List<Runnable> waitingWork = new ArrayList<>();
    private final Map<String, ProductDetails> details = new HashMap<>();
    /** The buy() waiting for Google's answer. */
    private PluginCall buying;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    /** Run once connected to Google Play (connecting first if needed). */
    private void ready(PluginCall call, Runnable then) {
        if (client.isReady()) {
            then.run();
            return;
        }
        waitingCalls.add(call);
        waitingWork.add(then);
        if (connecting) return;
        connecting = true;
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                connecting = false;
                List<PluginCall> calls = new ArrayList<>(waitingCalls);
                List<Runnable> work = new ArrayList<>(waitingWork);
                waitingCalls.clear();
                waitingWork.clear();
                boolean ok = result.getResponseCode() == BillingResponseCode.OK;
                for (int i = 0; i < calls.size(); i++) {
                    if (ok) work.get(i).run();
                    else calls.get(i).reject("Google Play isn't available: " + result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call connects again.
            }
        });
    }

    /** Prices for these product ids, in the player's currency. */
    @PluginMethod
    public void products(PluginCall call) {
        JSArray ids = call.getArray("ids");
        if (ids == null) {
            call.reject("ids missing");
            return;
        }
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        try {
            for (Object id : ids.toList()) {
                list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(String.valueOf(id)).setProductType(ProductType.INAPP).build());
            }
        } catch (JSONException e) {
            call.reject("bad ids");
            return;
        }
        ready(call, () ->
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (result, found) -> {
                if (result.getResponseCode() != BillingResponseCode.OK) {
                    call.reject("Couldn't get prices from Google Play: " + result.getDebugMessage());
                    return;
                }
                JSArray out = new JSArray();
                for (ProductDetails pd : found.getProductDetailsList()) {
                    details.put(pd.getProductId(), pd);
                    ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                    if (offer == null) continue;
                    JSObject o = new JSObject();
                    o.put("id", pd.getProductId());
                    o.put("price", offer.getFormattedPrice());
                    out.put(o);
                }
                JSObject res = new JSObject();
                res.put("products", out);
                call.resolve(res);
            })
        );
    }

    /** Show Google's payment sheet for one product. Resolves with the outcome. */
    @PluginMethod
    public void buy(PluginCall call) {
        String id = call.getString("id");
        String account = call.getString("account", "");
        ProductDetails pd = id == null ? null : details.get(id);
        if (pd == null) {
            call.reject("Unknown product: ask for its price first");
            return;
        }
        if (buying != null) {
            call.reject("A purchase is already open");
            return;
        }
        BillingFlowParams.Builder params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(List.of(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build()));
        // Ties the purchase to the player's account (a hash: Google never sees the account id).
        if (!account.isEmpty()) params.setObfuscatedAccountId(account);
        ready(call, () -> {
            buying = call;
            getActivity().runOnUiThread(() -> {
                BillingResult r = client.launchBillingFlow(getActivity(), params.build());
                if (r.getResponseCode() != BillingResponseCode.OK && buying == call) {
                    buying = null;
                    call.reject("Couldn't open Google Play: " + r.getDebugMessage());
                }
            });
        });
    }

    /** Purchases Google knows about that the server may not have finished yet. */
    @PluginMethod
    public void unfinished(PluginCall call) {
        ready(call, () ->
            client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(ProductType.INAPP).build(), (result, purchases) -> {
                if (result.getResponseCode() != BillingResponseCode.OK) {
                    call.reject("Couldn't check Google Play: " + result.getDebugMessage());
                    return;
                }
                JSArray out = new JSArray();
                for (Purchase p : purchases) out.put(toJs(p));
                JSObject res = new JSObject();
                res.put("purchases", out);
                call.resolve(res);
            })
        );
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = buying;
        buying = null;
        if (call == null) {
            // A purchase finished outside buy() (e.g. a pending payment went through): tell the game.
            notifyListeners("purchasesUpdated", new JSObject());
            return;
        }
        int code = result.getResponseCode();
        JSObject res = new JSObject();
        if (code == BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            res = toJs(purchases.get(0));
            res.put("status", purchases.get(0).getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
        } else if (code == BillingResponseCode.USER_CANCELED) {
            res.put("status", "cancelled");
        } else if (code == BillingResponseCode.ITEM_ALREADY_OWNED) {
            // An earlier purchase of this pack that the server hasn't finished: finish it first.
            res.put("status", "owned");
        } else {
            call.reject("Google Play: " + result.getDebugMessage() + " (" + code + ")");
            return;
        }
        call.resolve(res);
    }

    private static JSObject toJs(Purchase p) {
        JSObject o = new JSObject();
        o.put("id", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
        o.put("token", p.getPurchaseToken());
        o.put("pending", p.getPurchaseState() == Purchase.PurchaseState.PENDING);
        return o;
    }
}
