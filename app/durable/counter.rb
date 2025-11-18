class Counter < Hibana::DurableObject::Base
  def fetch(request)
    payload = request.json_body || {}
    action = payload["action"] || payload[:action]

    case action
    when "increment", nil
      increment!(payload["amount"] || payload[:amount])
    when "reset"
      reset!
    else
      json({ error: "Unknown action" }, status: 400)
    end
  end

  private

  def increment!(amount)
    delta = (amount || 1).to_i
    current = storage.get("count").to_i
    next_value = current + delta
    storage.put("count", next_value)
    json(count: next_value)
  end

  def reset!
    storage.put("count", 0)
    json(count: 0)
  end
end

Hibana::DurableObjects.register :COUNTER, Counter
