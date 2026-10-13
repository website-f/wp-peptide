import { ProhibitIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

const KEY = 'kyvo-age-ok'

function verified() {
  try {
    return localStorage.getItem(KEY) === '1' || sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function AgeGate() {
  const [open, setOpen] = useState(() => !verified())
  const [remember, setRemember] = useState(true)
  const [denied, setDenied] = useState(false)

  const accept = () => {
    try {
      ;(remember ? localStorage : sessionStorage).setItem(KEY, '1')
    } catch {
      /* storage blocked: gate shows again next visit */
    }
    setOpen(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <div className="flex justify-center border-b bg-surface py-6">
          <Logo to={null} />
        </div>
        {denied ? (
          <div className="p-6 text-center sm:p-8">
            <ProhibitIcon className="mx-auto size-10 text-destructive" />
            <DialogTitle className="mt-3 font-display text-3xl font-semibold uppercase">Access restricted</DialogTitle>
            <DialogDescription className="mt-2">You are not old enough to view this content.</DialogDescription>
            <Button variant="ghost" className="mt-5" onClick={() => setDenied(false)}>
              Go back
            </Button>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <DialogTitle className="text-center font-display text-3xl font-semibold uppercase sm:text-4xl">Are you 21 or older?</DialogTitle>
            <DialogDescription className="mt-2 text-center">KYVO sells research compounds for laboratory use only.</DialogDescription>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" onClick={() => setDenied(true)}>
                No
              </Button>
              <Button size="lg" onClick={accept}>
                Yes, I am 21+
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Checkbox id="age-remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              <Label htmlFor="age-remember" className="text-sm font-normal text-muted-foreground">
                Remember me on this device
              </Label>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
