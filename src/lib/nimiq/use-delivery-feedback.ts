import { useEffect, useState } from 'react';
import { deliveryFeedback, type DeliveryCheck } from './payout-feedback';
export function useDeliveryFeedback() {
  const [nextCheckAt, setNextCheckAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!nextCheckAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [nextCheckAt]);
  function feedback(result: DeliveryCheck) {
    const outcome = deliveryFeedback(result);
    const time = Date.now();
    setNow(time);
    setNextCheckAt(outcome.delayMs ? time + outcome.delayMs : 0);
    return outcome.message;
  }
  return { feedback, remainingSeconds: Math.max(0, Math.ceil((nextCheckAt - now) / 1000)) };
}