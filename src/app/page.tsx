import Image from "next/image";
import { Container } from "@/components/Container";
import { SocialLink, GitHub, LinkedIn, Mail } from "@/components/SocialIcons";
import headshot from '@/assets/headshot.jpg'

export default async function Home() {
  return (
    <Container className="mt-16 sm:mt-32">
      <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12">
        <div className="lg:order-first lg:row-span-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            I&apos;m Josh Si, software engineer based in the San Francisco Bay Area.
          </h1>
          <div className="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">
            I work on the Cloud Platform team at C3 AI, enhancing the developer experience with C3 AI Studio.
          </div>
        </div>
        <div className="lg:pl-20">
          <div className="max-w-xs px-2.5 lg:max-w-none">
            <Image
              src={headshot}
              priority={true}
              alt="Headshot of Josh Si"
              sizes="(min-width: 1024px) 32rem, 20rem"
              className="aspect-square rotate-3 rounded-2xl bg-zinc-100 object-cover dark:bg-zinc-800"
            />
          </div>
        </div>
      </div>
      <div className="mt-6 flex gap-6">
          <SocialLink
            href="https://github.com/joshsi"
            aria-label="View my GitHub"
            icon={GitHub}
          />
          <SocialLink
            href="https://linkedin.com/in/joshua-si"
            aria-label="View my LinkedIn"
            icon={LinkedIn}
          />
          <SocialLink
            href="mailto:contact@joshsi.com"
            aria-label="Email me"
            icon={Mail}
          />
        </div>
    </Container>
  )
}
