import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({quote:vi.fn(),state:vi.fn(),prepare:vi.fn(),check:vi.fn(),record:vi.fn(),send:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(f:unknown)=>f}));
vi.mock('@tanstack/react-router',()=>({Link:({children}: {children:React.ReactNode})=><a>{children}</a>}));
vi.mock('@/lib/nimiq/payments.functions',()=>({createPaymentQuote:m.quote,getPaymentState:m.state,preparePayment:m.prepare,checkPayment:m.check,recordSubmission:m.record}));
vi.mock('@/lib/nimiq',()=>({hostNetwork:async()=> 'testnet',initiatePayment:m.send,walletError:async(e:unknown)=>e instanceof Error?e.message:'Wallet response'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})}}}));
import { PaymentPanel } from './PaymentPanel';
const q={id:'purchase',network:'testnet',recipient:'recipient',sender:'payer',amountLuna:100000,savingsLuna:50000,expiresAt:'2099-01-01',status:'quoted',txHash:null,manifestationId:null};
async function settle(){ await act(async()=>{await Promise.resolve();await Promise.resolve();}); }
describe('existing purchase recovery',()=>{
 beforeEach(()=>{vi.useFakeTimers(); localStorage.clear();vi.clearAllMocks();m.state.mockResolvedValue(q);m.prepare.mockResolvedValue({...q,status:'pending',submissionOutcome:'awaiting_wallet',submissionStartedAt:new Date().toISOString()});m.record.mockResolvedValue(true);m.check.mockResolvedValue({...q,status:'pending',submissionOutcome:'unknown',retryAfterMs:60000});});
 afterEach(()=>{cleanup();vi.useRealTimers();});
 it('unresolved wallet watchdog unlocks checking, never another send, and resumes on return',async()=>{
  m.send.mockReturnValue(new Promise(()=>{}));render(<PaymentPanel dropId="d" intention="become" onFulfilled={()=>{}}/>);await settle();
  fireEvent.click(screen.getByText('Pay with Nimiq Pay'));fireEvent.click(screen.getByText('Pay with Nimiq Pay'));await settle();
  await act(async()=>{await vi.advanceTimersByTimeAsync(31000);});
  expect(m.send).toHaveBeenCalledTimes(1);expect(screen.queryByText('Pay with Nimiq Pay')).toBeNull();
  fireEvent(document,new Event('visibilitychange'));await settle();expect(m.check).toHaveBeenCalled();expect(m.quote).not.toHaveBeenCalled();
 });
 it('keeps explicit cancellation separate and locked',async()=>{
  m.send.mockRejectedValue({type:'PERMISSION_DENIED'});render(<PaymentPanel dropId="d" intention="become" onFulfilled={()=>{}}/>);await settle();fireEvent.click(screen.getByText('Pay with Nimiq Pay'));await settle();
  expect(m.record).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outcome:'cancelled'})}));expect(screen.queryByText('Pay with Nimiq Pay')).toBeNull();
 });
 it('keeps provider rejection distinct without offering another wallet request',async()=>{
  m.send.mockRejectedValue({type:'INVALID_REQUEST'});render(<PaymentPanel dropId="d" intention="become" onFulfilled={()=>{}}/>);await settle();fireEvent.click(screen.getByText('Pay with Nimiq Pay'));await settle();
  expect(m.record).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outcome:'rejected'})}));expect(m.send).toHaveBeenCalledTimes(1);
 });
 it('suppresses background checks and recovers fulfillment on return without a send',async()=>{
  m.state.mockResolvedValue({...q,status:'pending',submissionOutcome:'unknown'});m.check.mockResolvedValue({...q,status:'fulfilled',manifestationId:'existing-art'});
  const done=vi.fn();Object.defineProperty(document,'hidden',{configurable:true,value:true});
  render(<PaymentPanel dropId="d" intention="become" onFulfilled={done}/>);await settle();await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(m.check).not.toHaveBeenCalled();
  Object.defineProperty(document,'hidden',{configurable:true,value:false});fireEvent(document,new Event('visibilitychange'));await settle();expect(done).toHaveBeenCalledWith('existing-art');expect(m.send).not.toHaveBeenCalled();
 });
 it('retains late returned hash locally if backend persistence fails, then recovers after remount',async()=>{
  const hash='b'.repeat(64);m.send.mockResolvedValue(hash);m.record.mockRejectedValue(new Error('storage unavailable'));
  const r=render(<PaymentPanel dropId="d" intention="become" onFulfilled={()=>{}}/>);await settle();fireEvent.click(screen.getByText('Pay with Nimiq Pay'));await settle();
  expect(localStorage.getItem('nimaura:submission:owner:purchase')).toBe(hash);r.unmount();m.state.mockResolvedValue({...q,status:'pending'});
  render(<PaymentPanel dropId="d" intention="become" onFulfilled={()=>{}}/>);await settle();expect(screen.getByLabelText('Transaction hash')).toHaveValue(hash);expect(m.send).toHaveBeenCalledTimes(1);
 });
});