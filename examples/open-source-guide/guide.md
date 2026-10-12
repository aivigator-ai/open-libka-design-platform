---
title: Running an open source project
subtitle: How to launch your project and how to keep maintaining it without burning out
status: Example
lang: en
outputs: [web, pdf, deck, docx]
---

This manual combines two of GitHub's Open Source Guides: *Starting an Open Source Project* and *Best Practices for Maintainers*. Source: [opensource.guide](https://opensource.guide), by GitHub and its contributors, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); shortened and arranged as LibKa blocks.

## The "what" and "why" of open source

So you're thinking about getting started with open source? Congratulations! The world appreciates your contribution. Let's talk about what open source is and why people do it.

### What does "open source" mean?

When a project is open source, that means **anybody is free to use, study, modify, and distribute your project for any purpose.** These permissions are enforced through [an open source license](https://opensource.org/licenses).

Open source is powerful because it lowers the barriers to adoption and collaboration, allowing people to spread and improve projects quickly. Also because it gives users a potential to control their own computing, relative to closed source. For example, a business using open source software has the option to hire someone to make custom improvements to the software, rather than relying exclusively on a closed source vendor's product decisions.

### Free software, FOSS and FLOSS

*Free software* refers to the same set of projects as *open source*. Sometimes you'll also see [these terms combined](https://en.wikipedia.org/wiki/Free_and_open-source_software) as "free and open source software" (FOSS) or "free, libre, and open source software" (FLOSS).

*Free* and *libre* refer to freedom, [not price](#does-open-source-mean-free-of-charge).

### Why do people open source their work?

:::quote{source="@kentcdodds, How getting into Open Source has been awesome for me" cite="https://kentcdodds.com/blog/how-getting-into-open-source-has-been-awesome-for-me"}
One of the most rewarding experiences I get out of using and collaborating on open source comes from the relationships that I build with other developers facing many of the same problems I am.
:::

[There are many reasons](https://ben.balter.com/2015/11/23/why-open-source/) why a person or organization would want to open source a project.

### Collaboration, adoption and transparency

Some examples of why people open source a project:

- **Collaboration:** Open source projects can accept changes from anybody in the world. [Exercism](https://github.com/exercism/), for example, is a programming exercise platform with over 350 contributors.
- **Adoption and remixing:** Open source projects can be used by anyone for nearly any purpose. People can even use it to build other things. [WordPress](https://github.com/WordPress), for example, started as a fork of an existing project called [b2](https://github.com/WordPress/book/blob/HEAD/Content/Part%201/2-b2-cafelog.md).
- **Transparency:** Anyone can inspect an open source project for errors or inconsistencies. Transparency matters to governments like [Bulgaria](https://medium.com/@bozhobg/bulgaria-got-a-law-requiring-open-source-98bf626cf70a) or the [United States](https://digital.gov/resources/requirements-for-achieving-efficiency-transparency-and-innovation-through-reusable-and-open-source-software/), regulated industries like banking or healthcare, and security software like [Let's Encrypt](https://github.com/letsencrypt).

### Not just software

Open source isn't just for software, either. You can open source everything from data sets to books. Check out [GitHub Explore](https://github.com/explore) for ideas on what else you can open source.

### Does open source mean "free of charge"?

One of open source's biggest draws is that it does not cost money. "Free of charge", however, is a byproduct of open source's overall value.

Because [an open source license requires](https://opensource.org/definition-annotated/) that anyone can use, modify, and share your project for nearly any purpose, projects themselves tend to be free of charge. If the project cost money to use, anyone could legally make a copy and use the free version instead.

As a result, most open source projects are free, but "free of charge" is not part of the open source definition. There are ways to charge for open source projects indirectly through dual licensing or limited features, while still complying with the official definition of open source.

## Should I launch my own open source project?

The short answer is yes, because no matter the outcome, launching your own project is a great way to learn how open source works.

### If you're nervous, you're not alone

If you've never open sourced a project before, you might be nervous about what people will say, or whether anyone will notice at all. If this sounds like you, you're not alone!

Open source work is like any other creative activity, whether it's writing or painting. It can feel scary to share your work with the world, but the only way to get better is to practice, even if you don't have an audience.

If you're not yet convinced, take a moment to think about what your goals might be.

### Setting your goals

Goals can help you figure out what to work on, what to say no to, and where you need help from others. Start by asking yourself, *why am I open sourcing this project?*

There is no one right answer to this question. You may have multiple goals for a single project, or different projects with different goals.

If your only goal is to show off your work, you may not even want contributions, and even say so in your README. On the other hand, if you do want contributors, you'll invest time into clear documentation and making newcomers feel welcome.

### A small project still counts

:::quote{source="@mavris, Self-taught Software Developers: Why Open Source is important to us" cite="https://medium.com/rocknnull/self-taught-software-engineers-why-open-source-is-important-to-us-fe2a3473a576"}
At some point I created a custom UIAlertView that I was using...and I decided to make it open source. So I modified it to be more dynamic and uploaded it to GitHub. I also wrote my first documentation explaining to other developers how to use it on their projects. Probably nobody ever used it because it was a simple project but I was feeling good about my contribution.
:::

### More than code

As your project grows, your community may need more than just code from you. Responding to issues, reviewing code, and evangelizing your project are all important tasks in an open source project.

While the amount of time you spend on non-coding tasks will depend on the size and scope of your project, you should be prepared as a maintainer to address them yourself or find someone to help you.

### If you're part of a company

**If you're part of a company open sourcing a project,** make sure your project has the internal resources it needs to thrive. You'll want to identify who's responsible for maintaining the project after launch, and how you'll share those tasks with your community.

:::callout[Start budget conversations early]{variant=info}
If you need a dedicated budget or staffing for promotion, operations and maintaining the project, start those conversations early.
:::

### Involve contributors from outside

:::quote{source="@captainsafia, So you wanna open source a project, eh?" cite="https://dev.to/captainsafia/so-you-wanna-open-source-a-project-eh-5779"}
As you begin to open source the project, it's important to make sure that your management processes take into consideration the contributions and abilities of the community around your project. Don't be afraid to involve contributors who are not employed in your business in key aspects of the project — especially if they are frequent contributors.
:::

### Contributing to other projects

If your goal is to learn how to collaborate with others or understand how open source works, consider contributing to an existing project. Start with a project that you already use and love. Contributing to a project can be as simple as fixing typos or updating documentation.

If you're not sure how to get started as a contributor, check out the [How to Contribute to Open Source guide](https://opensource.guide/how-to-contribute/).

## Launching your own open source project

There is no perfect time to open source your work. You can open source an idea, a work in progress, or after years of being closed source.

Generally speaking, you should open source your project when you feel comfortable having others view, and give feedback on, your work.

### The documents every project needs

No matter which stage you decide to open source your project, every project should include the following documentation:

- [Open source license](https://help.github.com/articles/open-source-licensing/#where-does-the-license-live-on-my-repository)
- [README](https://help.github.com/articles/create-a-repo/#commit-your-first-change)
- [Contributing guidelines](https://help.github.com/articles/setting-guidelines-for-repository-contributors/)
- [Code of conduct](https://opensource.guide/code-of-conduct/)

### Why these documents matter

As a maintainer, these components will help you communicate expectations, manage contributions, and protect everyone's legal rights (including your own). They significantly increase your chances of having a positive experience.

If your project is on GitHub, putting these files in your root directory with the recommended filenames will help GitHub recognize and automatically surface them to your readers.

### Choosing a license

An open source license guarantees that others can use, copy, modify, and contribute back to your project without repercussions. It also protects you from sticky legal situations.

:::callout[You must include a license]{variant=warning}
You must include a license when you launch an open source project.
:::

Legal work is no fun. The good news is that you can copy and paste an existing license into your repository. It will only take a minute to protect your hard work.

### Popular licenses

[MIT](https://choosealicense.com/licenses/mit/), [Apache 2.0](https://choosealicense.com/licenses/apache-2.0/), and [GPLv3](https://choosealicense.com/licenses/gpl-3.0/) are the most popular open source licenses, but [there are other options](https://choosealicense.com) to choose from.

When you create a new project on GitHub, you are given the option to select a license from a list on the new repository form. Including an open source license will make your GitHub project open source.

If you have other questions or concerns around the legal aspects of managing an open source project, the [Legal Guide](https://opensource.guide/legal/) has you covered.

### Writing a README

READMEs do more than explain how to use your project. They also explain why your project matters, and what your users can do with it.

In your README, try to answer the following questions:

- What does this project do?
- Why is this project useful?
- How do I get started?
- Where can I get more help, if I need it?

### What else goes in a README

You can use your README to answer other questions, like how you handle contributions, what the goals of the project are, and information about licenses and attribution. If you don't want to accept contributions, or your project is not yet ready for production, write this information down.

:::quote{source="@tracymakes, Writing So Your Words Are Read (video)" cite="https://www.youtube.com/watch?v=8LiV759Bje0&list=PLmV2D6sIiX3U03qc-FPXgLFGFkccCEtfv&index=10"}
Better documentation means more users, less support requests, and more contributors. (...) Remember that your readers aren't you. There are people who might come to a project who have completely different experiences.
:::

### Write a README even when you're not ready

Sometimes, people avoid writing a README because they feel like the project is unfinished, or they don't want contributions. These are all very good reasons to write one.

For more inspiration, try using @dguo's ["Make a README" guide](https://www.makeareadme.com/) or @PurpleBooth's [README template](https://gist.github.com/PurpleBooth/109311bb0361f32d87a2) to write a complete README.

When you include a README file in the root directory, GitHub will automatically display it on the repository homepage.

### Writing your contributing guidelines

A CONTRIBUTING file tells your audience how to participate in your project. For example, you might include information on:

- How to file a bug report (try using [issue and pull request templates](https://github.com/blog/2111-issue-and-pull-request-templates))
- How to suggest a new feature
- How to set up your environment and run tests

### State your expectations

In addition to technical details, a CONTRIBUTING file is an opportunity to communicate your expectations for contributions, such as:

- The types of contributions you're looking for
- Your roadmap or vision for the project
- How contributors should (or should not) get in touch with you

### Use a warm, friendly tone

Using a warm, friendly tone and offering specific suggestions for contributions (such as writing documentation, or making a website) can go a long way in making newcomers feel welcomed and excited to participate.

For example, [Active Admin](https://github.com/activeadmin/activeadmin/) starts its contributing guide with:

:::quote{source="Active Admin, Contributing guide" cite="https://github.com/activeadmin/activeadmin/blob/HEAD/CONTRIBUTING.md"}
First off, thank you for considering contributing to Active Admin. It's people like you that make Active Admin such a great tool.
:::

### Grow your CONTRIBUTING file over time

In the earliest stages of your project, your CONTRIBUTING file can be simple. You should always explain how to report bugs or file issues, and any technical requirements (like tests) to make a contribution.

Over time, you might add other frequently asked questions to your CONTRIBUTING file. Writing down this information means fewer people will ask you the same questions over and over again.

For more help with writing your CONTRIBUTING file, check out @nayafia's [contributing guide template](https://github.com/nayafia/contributing-template/blob/HEAD/CONTRIBUTING-template.md) or @mozilla's ["How to Build a CONTRIBUTING.md"](https://mozillascience.github.io/working-open-workshop/contributing/).

### Make your guidelines easy to find

Link to your CONTRIBUTING file from your README, so more people see it.

If you [place the CONTRIBUTING file in your project's repository](https://help.github.com/articles/setting-guidelines-for-repository-contributors/), GitHub will automatically link to your file when a contributor creates an issue or opens a pull request: a note above the form points them to your contributing guidelines.

### Establishing a code of conduct

:::quote{source="@mlynch, Making Open Source a Happier Place" cite="https://medium.com/ionic-and-the-mobile-web/making-open-source-a-happier-place-3b90d254f5f"}
We've all had experiences where we faced what was probably abuse either as a maintainer trying to explain why something had to be a certain way, or as a user...asking a simple question. (...) A code of conduct becomes an easily referenced and linkable document that indicates that your team takes constructive discourse very seriously.
:::

### Why a code of conduct helps

Finally, a code of conduct helps set ground rules for behavior for your project's participants. This is especially valuable if you're launching an open source project for a community or company. A code of conduct empowers you to facilitate healthy, constructive community behavior, which will reduce your stress as a maintainer.

For more information, check out the [Code of Conduct guide](https://opensource.guide/code-of-conduct/).

In addition to communicating *how* you expect participants to behave, a code of conduct also tends to describe who these expectations apply to, when they apply, and what to do if a violation occurs.

### Use an existing code of conduct

Much like open source licenses, there are also emerging standards for codes of conduct, so you don't have to write your own. The [Contributor Covenant](https://contributor-covenant.org/) is a drop-in code of conduct that is used by [over 40,000 open source projects](https://www.contributor-covenant.org/adopters), including Kubernetes, Rails, and Swift.

:::callout[Be ready to enforce it]{variant=warning}
No matter which text you use, you should be prepared to enforce your code of conduct when necessary.
:::

### Adding a code of conduct to your repository

:::steps
1. **Paste the text** directly into a CODE_OF_CONDUCT file in your repository.
2. **Keep the file in your project's root directory** so it's easy to find.
3. **Link to it** from your README.
:::

## Naming and branding your project

Branding is more than a flashy logo or catchy project name. It's about how you talk about your project, and who you reach with your message.

### Choosing the right name

Pick a name that is easy to remember and, ideally, gives some idea of what the project does. For example:

- [Sentry](https://github.com/getsentry/sentry) monitors apps for crash reporting
- [Thin](https://github.com/macournoyer/thin) is a fast and simple Ruby web server

If you're building upon an existing project, using their name as a prefix can help clarify what your project does (for example, [node-fetch](https://github.com/bitinn/node-fetch) brings `window.fetch` to Node.js).

### Consider clarity above all

Puns are fun, but remember that some jokes might not translate to other cultures or people with different experiences from you. Some of your potential users might be company employees: you don't want to make them uncomfortable when they have to explain your project at work!

### Avoiding name conflicts

[Check for open source projects with a similar name](https://namechecker.vercel.app/), especially if you share the same language or ecosystem. If your name overlaps with a popular existing project, you might confuse your audience.

If you want a website, Twitter handle, or other properties to represent your project, make sure you can get the names you want. Ideally, [reserve those names now](https://instantdomainsearch.com/) for peace of mind, even if you don't intend to use them just yet.

### Check for trademarks

:::callout[Don't infringe on trademarks]{variant=warning}
Make sure that your project's name doesn't infringe upon any trademarks. A company might ask you to take down your project later on, or even take legal action against you. It's just not worth the risk.
:::

You can check the [WIPO Global Brand Database](http://www.wipo.int/branddb/en/) for trademark conflicts. If you're at a company, this is one of the things your [legal team can help you with](https://opensource.guide/legal/).

Finally, do a quick Google search for your project name. Will people be able to easily find your project? Does something else appear in the search results that you wouldn't want them to see?

### How you write (and code) affects your brand, too!

Throughout the life of your project, you'll do a lot of writing: READMEs, tutorials, community documents, responding to issues, maybe even newsletters and mailing lists.

Whether it's official documentation or a casual email, your writing style is part of your project's brand. Consider how you might come across to your audience and whether that is the tone you wish to convey.

### Set an example others follow

:::quote{source="@janl on CouchDB, Sustainable Open Source" cite="https://web.archive.org/web/20200723213552/https://writing.jan.io/2015/11/20/sustainable-open-source.html"}
I tried to be involved with every thread on the mailing list, and showing exemplary behaviour, being nice to people, taking their issues seriously and trying to be helpful overall. After a while, people stuck around not to only ask questions, but to help with the answering as well, and to my complete delight, they mimicked my style.
:::

@janl wrote this about his work on [CouchDB](https://github.com/apache/couchdb).

### Use warm, simple language

Using warm, inclusive language (such as "them", even when referring to the single person) can go a long way in making your project feel welcoming to new contributors. Stick to simple language, as many of your readers may not be native English speakers.

### Your coding style is part of your brand

Beyond how you write words, your coding style may also become part of your project's brand. [Angular](https://angular.io/guide/styleguide) and [jQuery](https://contribute.jquery.org/style-guide/js/) are two examples of projects with rigorous coding styles and guidelines.

It isn't necessary to write a style guide for your project when you're just starting out, and you may find that you enjoy incorporating different coding styles into your project anyway. But you should anticipate how your writing and coding style might attract or discourage different types of people. The earliest stages of your project are your opportunity to set the precedent you wish to see.

## Your pre-launch checklist

Ready to open source your project? Here's a checklist to help. Check all the boxes? You're ready to go! [Make your repository public](https://help.github.com/articles/making-a-private-repository-public/) and pat yourself on the back.

### Documentation

:::checklist
- [ ] Project has a LICENSE file with an open source license
- [ ] Project has basic documentation (README, CONTRIBUTING, CODE_OF_CONDUCT)
- [ ] The name is easy to remember, gives some idea of what the project does, and does not conflict with an existing project or infringe on trademarks
- [ ] The issue queue is up-to-date, with issues clearly organized and labeled
:::

### Code

:::checklist
- [ ] Project uses consistent code conventions and clear function/method/variable names
- [ ] The code is clearly commented, documenting intentions and edge cases
- [ ] There are no sensitive materials in the revision history, issues, or pull requests (for example, passwords or other non-public information)
:::

### People

:::::tabs
::::tab[If you're an individual]
:::checklist
- [ ] You've talked to the legal department and/or understand the IP and open source policies of your company (if you're an employee somewhere)
:::
::::
::::tab[If you're a company or organization]
:::checklist
- [ ] You've talked to your legal department
- [ ] You have a marketing plan for announcing and promoting the project
- [ ] Someone is committed to managing community interactions (responding to issues, reviewing and merging pull requests)
- [ ] At least two people have administrative access to the project
:::
::::
:::::

## You did it!

Congratulations on open sourcing your first project. No matter the outcome, working in public is a gift to the community. With every commit, comment, and pull request, you're creating opportunities for yourself and for others to learn and grow.

## What does it mean to be a maintainer?

If you maintain an open source project that a lot of people use, you may have noticed you're coding less and responding to issues more.

In the early stages of a project, you're experimenting with new ideas and making decisions based on what you want. As your project increases in popularity, you'll find yourself working with your users and contributors more.

Maintaining a project requires more than code. These tasks are often unexpected, but they're just as important to a growing project. Here are a few ways to make your life easier, from documenting processes to leveraging your community.

## Documenting your processes

:::statement
Writing things down is one of the most important things you can do as a maintainer.
:::

### Why writing things down helps

Documentation not only clarifies your own thinking, but it helps other people understand what you need or expect, before they even ask.

Writing things down makes it easier to say no when something doesn't fit into your scope. It also makes it easier for people to pitch in and help. You never know who might be reading or using your project.

Even if you don't use full paragraphs, jotting down bullet points is better than not writing at all.

Remember to keep your documentation up-to-date. If you're not able to always do this, delete your outdated documentation or indicate it is outdated so contributors know updates are welcome.

### Write down your project's vision

Start by writing down the goals of your project. Add them to your README, or create a separate file called VISION. If there are other artifacts that could help, like a project roadmap, make those public as well.

Having a clear, documented vision keeps you focused and helps you avoid "scope creep" from others' contributions.

### A vision helps you choose

For example, @lord discovered that having a project vision helped him figure out which requests to spend time on. As a new maintainer, he regretted not sticking to his project's scope when he got his first feature request for [Slate](https://github.com/lord/slate).

:::quote{source="@lord, Tips for new open source maintainers" cite="https://lord.io/blog/2014/oss-tips/"}
I fumbled it. I didn't put in the effort to come up with a complete solution. Instead of a half-assed solution, I wish I had said "I don't have time for this right now, but I'll add it to the long term nice-to-have list."
:::

### Communicate your expectations

Rules can be nerve-wracking to write down. Sometimes you might feel like you're policing other people's behavior or killing all the fun.

Written and enforced fairly, however, good rules empower maintainers. They prevent you from getting dragged into doing things you don't want to do.

### Be honest about your time

Most people who come across your project don't know anything about you or your circumstances. They may assume you get paid to work on it, especially if it's something they regularly use and depend on. Maybe at one point you put a lot of time into your project, but now you're busy with a new job or family member.

All of this is perfectly okay! Just make sure other people know about it.

If maintaining your project is part-time or purely volunteered, be honest about how much time you have. This is not the same as how much time you think the project requires, or how much time others want you to spend.

### Rules worth writing down

- How a contribution is reviewed and accepted (*Do they need tests? An issue template?*)
- The types of contributions you'll accept (*Do you only want help with a certain part of your code?*)
- When it's appropriate to follow up (*for example, "You can expect a response from a maintainer within 7 days. If you haven't heard anything by then, feel free to ping the thread."*)
- How much time you spend on the project (*for example, "We only spend about 5 hours per week on this project"*)

[Jekyll](https://github.com/jekyll/jekyll/tree/master/docs), [CocoaPods](https://github.com/CocoaPods/CocoaPods/wiki/Communication-&-Design-Rules), and [Homebrew](https://github.com/Homebrew/brew/blob/bbed7246bc5c5b7acb8c1d427d10b43e090dfd39/docs/Maintainers-Avoiding-Burnout.md) are several examples of projects with ground rules for maintainers and contributors.

### Keep communication public

Don't forget to document your interactions, too. Wherever you can, keep communication about your project public. If somebody tries to contact you privately to discuss a feature request or support need, politely direct them to a public communication channel, such as a mailing list or issue tracker.

If you meet with other maintainers, or make a major decision in private, document these conversations in public, even if it's just posting your notes.

That way, anybody who joins your community will have access to the same information as someone who's been there for years.

## Learning to say no

You've written things down. Ideally, everybody would read your documentation, but in reality, you'll have to remind others that this knowledge exists.

Having everything written down, however, helps depersonalize situations when you do need to enforce your rules.

### Saying no, less personally

Saying no isn't fun, but *"Your contribution doesn't match this project's criteria"* feels less personal than *"I don't like your contribution"*.

Saying no applies to many situations you'll come across as a maintainer: feature requests that don't fit the scope, someone derailing a discussion, doing unnecessary work for others.

### Keep the conversation friendly

One of the most important places you'll practice saying no is on your issue and pull request queue. As a project maintainer, you'll inevitably receive suggestions that you don't want to accept.

Maybe the contribution changes your project's scope or doesn't match your vision. Maybe the idea is good, but the implementation is poor.

Regardless of the reason, it is possible to tactfully handle contributions that don't meet your project's standards.

### Don't ignore unwanted contributions

If you receive a contribution you don't want to accept, your first reaction might be to ignore it or pretend you didn't see it. Doing so could hurt the other person's feelings and even demotivate other potential contributors in your community.

:::quote{source="@KrauseFx, Scaling open source communities" cite="https://krausefx.com/blog/scaling-open-source-communities"}
The key to handling support for large-scale open source projects is to keep issues moving. Try to avoid having issues stall. If you're an iOS developer you know how frustrating it can be to submit radars. You might hear back 2 years later, and are told to try again with the latest version of iOS.
:::

### Close what you won't accept

Don't leave an unwanted contribution open because you feel guilty or want to be nice. Over time, your unanswered issues and PRs will make working on your project feel that much more stressful and intimidating.

It's better to immediately close the contributions you know you don't want to accept. If your project already suffers from a large backlog, @steveklabnik has suggestions for [how to triage issues efficiently](https://steveklabnik.com/writing/how-to-be-an-open-source-gardener).

Secondly, ignoring contributions sends a negative signal to your community. Contributing to a project can be intimidating, especially if it's someone's first time. Even if you don't accept their contribution, acknowledge the person behind it and thank them for their interest. It's a big compliment!

### How to decline a contribution

If you don't want to accept a contribution:

:::steps
1. **Thank them** for their contribution.
2. **Explain why it doesn't fit** into the scope of the project, and offer clear suggestions for improvement, if you're able. Be kind, but firm.
3. **Link to relevant documentation**, if you have it. If you notice repeated requests for things you don't want to accept, add them into your documentation to avoid repeating yourself.
4. **Close the request.**
:::

### Keep your reply short

You shouldn't need more than 1-2 sentences to respond. For example, when a user of [celery](https://github.com/celery/celery/) reported a Windows-related error, @berkerpeksag [responded in the issue](https://github.com/celery/celery/issues/3383) with a short reply of that kind.

If the thought of saying no terrifies you, you're not alone. As @jessfraz [put it in The Art of Closing](https://blog.jessfraz.com/post/the-art-of-closing/):

:::quote{source="@jessfraz, The Art of Closing" cite="https://blog.jessfraz.com/post/the-art-of-closing/"}
I've talked to maintainers from several different open source projects, Mesos, Kubernetes, Chromium, and they all agree one of the hardest parts of being a maintainer is saying "No" to patches you don't want.
:::

### No is temporary, yes is forever

Don't feel guilty about not wanting to accept someone's contribution. The first rule of open source, [according to @shykes](https://twitter.com/solomonstre/status/715277134978113536): *"No is temporary, yes is forever."* While empathizing with another person's enthusiasm is a good thing, rejecting a contribution is not the same as rejecting the person behind it.

Ultimately, if a contribution isn't good enough, you're under no obligation to accept it. Be kind and responsive when people contribute to your project, but only accept changes that you truly believe will make your project better. The more often you practice saying no, the easier it becomes. Promise.

### Be proactive

To reduce the volume of unwanted contributions in the first place, explain your project's process for submitting and accepting contributions in your contributing guide.

If you're receiving too many low-quality contributions, require that contributors do a bit of work beforehand, for example:

- Fill out an issue or PR template/checklist
- Open an issue before submitting a PR

If they don't follow your rules, close the issue immediately and point to your documentation.

### Good for both parties

While this approach may feel unkind at first, being proactive is actually good for both parties. It reduces the chance that someone will put many wasted hours of work into a pull request that you aren't going to accept. And it makes your workload easier to manage.

:::quote{source="@MikeMcQuaid, Kindly Closing Pull Requests" cite="https://github.com/blog/2124-kindly-closing-pull-requests"}
Ideally, explain to them and in a CONTRIBUTING.md file how they can get a better indication in the future on what would or would not be accepted before they begin the work.
:::

### When a contributor gets upset

Sometimes, when you say no, your potential contributor may get upset or criticize your decision.

:::callout[If behavior becomes hostile]{variant=warning}
[Take steps to defuse the situation](https://github.com/jonschlinkert/maintainers-guide-to-staying-positive#action-items) or even remove them from your community, if they're not willing to collaborate constructively.
:::

### Embrace mentorship

Maybe someone in your community regularly submits contributions that don't meet your project's standards. It can be frustrating for both parties to repeatedly go through rejections.

If you see that someone is enthusiastic about your project, but needs a bit of polish, be patient. Explain clearly in each situation why their contributions don't meet the expectations of the project. Try pointing them to an easier or less ambiguous task, like an issue marked *"good first issue,"* to get their feet wet. If you have time, consider mentoring them through their first contribution, or find someone else in your community who might be willing to mentor them.

## Leverage your community

You don't have to do everything yourself. Your project's community exists for a reason! Even if you don't yet have an active contributor community, if you have a lot of users, put them to work.

### Share the workload

If you're looking for others to pitch in, start by asking around.

One way to gain new contributors is to explicitly [label issues that are simple enough for beginners to tackle](https://help.github.com/en/articles/helping-new-contributors-find-your-project-with-labels). GitHub will then surface these issues in various places on the platform, increasing their visibility.

When you see new contributors making repeated contributions, recognize their work by offering more responsibility. Document how others can grow into leadership roles if they wish.

### Share ownership

Encouraging others to [share ownership of the project](https://opensource.guide/building-community/#share-ownership-of-your-project) can greatly reduce your own workload, as @lmccart discovered on her project, [p5.js](https://github.com/processing/p5.js).

:::quote{source="@lmccart, What Does “Open Source” Even Mean? p5.js Edition" cite="https://medium.com/@kenjagan/what-does-open-source-even-mean-p5-js-edition-98c02d354b39"}
I'd been saying, "Yeah, anyone can be involved, you don't have to have a lot of coding expertise [...]." We had people sign up to come [to an event] and that's when I was really wondering: is this true, what I've been saying? There are gonna be 40 people who show up, and it's not like I can sit with each of them...But people came together, and it just sort of worked. As soon as one person got it, they could teach their neighbour.
:::

### Stepping away

If you need to step away from your project, either on hiatus or permanently, there's no shame in asking someone else to take over for you.

If other people are enthusiastic about its direction, give them commit access or formally hand over control to someone else. If someone forked your project and is actively maintaining it elsewhere, consider linking to the fork from your original project. It's great that so many people want your project to live on!

### A written vision outlives you

@progrium [found that documenting the vision](https://web.archive.org/web/20151204215958/https://progrium.com/blog/2015/12/04/leadership-guilt-and-pull-requests/) for his project, [Dokku](https://github.com/dokku/dokku), helped those goals live on even after he stepped away from the project:

:::quote{source="@progrium" cite="https://web.archive.org/web/20151204215958/https://progrium.com/blog/2015/12/04/leadership-guilt-and-pull-requests/"}
I wrote a wiki page describing what I wanted and why I wanted it. For some reason it came as a surprise to me that the maintainers started moving the project in that direction! Did it happen exactly how I'd do it? Not always. But it still brought the project closer to what I wrote down.
:::

### Let others build the solutions they need

If a potential contributor has a different opinion on what your project should do, you may want to gently encourage them to work on their own fork.

Forking a project doesn't have to be a bad thing. Being able to copy and modify projects is one of the best things about open source. Encouraging your community members to work on their own fork can provide the creative outlet they need, without conflicting with your project's vision.

### Forks are welcome

:::quote{source="@geerlingguy, Why I Close PRs" cite="https://www.jeffgeerling.com/blog/2016/why-i-close-prs-oss-project-maintainer-notes"}
I cater to the 80% use case. If you are one of the unicorns, please fork my work. I won't get offended! My public projects are almost always meant to solve the most common problems; I try to make it easy to go deeper by either forking my work or extending it.
:::

### Turn your tool into a platform

The same applies to a user who really wants a solution that you simply don't have the bandwidth to build. Offering APIs and customization hooks can help others meet their own needs, without having to modify the source directly. @orta [found that encouraging plugins for CocoaPods](https://artsy.github.io/blog/2016/07/03/handling-big-projects/) led to "some of the most interesting ideas":

:::quote{source="@orta" cite="https://artsy.github.io/blog/2016/07/03/handling-big-projects/"}
It's almost inevitable that once a project becomes big, maintainers have to become a lot more conservative about how they introduce new code. You become good at saying "no", but a lot of people have legitimate needs. So, instead you end up converting your tool into a platform.
:::

## Bring in the robots

Just as there are tasks that other people can help you with, there are also tasks that no human should ever have to do. Robots are your friend. Use them to make your life as a maintainer easier.

### Require tests and other checks to improve the quality of your code

One of the most important ways you can automate your project is by adding tests.

Tests help contributors feel confident that they won't break anything. They also make it easier for you to review and accept contributions quickly. The more responsive you are, the more engaged your community can be.

### Set up automatic tests

:::steps
1. **Set up automatic tests** that will run on all incoming contributions, and ensure that your tests can easily be run locally by contributors.
2. **Require that all code contributions pass your tests** before they can be submitted. You'll help set a minimum standard of quality for all submissions. [Required status checks](https://help.github.com/articles/about-required-status-checks/) on GitHub can help ensure no change gets merged without your tests passing.
3. **Explain how your tests work** in your CONTRIBUTING file.
:::

### Tests catch regressions

:::quote{source="@edunham, Rust's Community Automation" cite="https://web.archive.org/web/20161020132400/https://edunham.net/2016/09/27/rust_s_community_automation.html"}
I believe that tests are necessary for all code that people work on. If the code was fully and perfectly correct, it wouldn't need changes – we only write code when something is wrong, whether that's "It crashes" or "It lacks such-and-such a feature". And regardless of the changes you're making, tests are essential for catching any regressions you might accidentally introduce.
:::

### Use tools to automate basic maintenance tasks

The good news about maintaining a popular project is that other maintainers have probably faced similar issues and built a solution for them.

There are a [variety of tools available](https://github.com/showcases/tools-for-open-source) to help automate some aspects of maintenance work. A few examples:

- [semantic-release](https://github.com/semantic-release/semantic-release) automates your releases
- [mention-bot](https://github.com/facebook/mention-bot) mentions potential reviewers for pull requests
- [Danger](https://github.com/danger/danger) helps automate code review
- [no-response](https://github.com/probot/no-response) closes issues where the author hasn't responded to a request for more information
- [dependabot](https://github.com/dependabot) checks your dependency files every day for outdated requirements and opens individual pull requests for any it finds

### Templates and notifications

For bug reports and other common contributions, GitHub has [Issue Templates and Pull Request Templates](https://github.com/blog/2111-issue-and-pull-request-templates), which you can create to streamline the communication you receive. @TalAter made a [Choose Your Own Adventure guide](https://www.talater.com/open-source-templates/#/) to help you write your issue and PR templates.

To manage your email notifications, you can set up [email filters](https://github.com/blog/2203-email-updates-about-your-own-activity) to organize by priority.

### Style guides and linters

If you want to get a little more advanced, style guides and linters can standardize project contributions and make them easier to review and accept.

However, if your standards are too complicated, they can increase the barriers to contribution. Make sure you're only adding enough rules to make everyone's lives easier.

If you're not sure which tools to use, look at what other popular projects do, especially those in your ecosystem. For example, what does the contribution process look like for other Node modules? Using similar tools and approaches will also make your process more familiar to your target contributors.

## It's okay to hit pause

Open source work once brought you joy. Maybe now it's starting to make you feel avoidant or guilty.

Perhaps you're feeling overwhelmed or a growing sense of dread when you think about your projects. And meanwhile, the issues and pull requests pile up.

### Take a break

Burnout is a real and pervasive issue in open source work, especially among maintainers. As a maintainer, your happiness is a non-negotiable requirement for the survival of any open source project.

Although it should go without saying, take a break! You shouldn't have to wait until you feel burned out to take a vacation. @brettcannon, a Python core developer, decided to take [a month-long vacation](https://snarky.ca/why-i-took-october-off-from-oss-volunteering/) after 14 years of volunteer OSS work.

Just like any other type of work, taking regular breaks will keep you refreshed, happy, and excited about your work.

### Set clear boundaries

:::quote{source="@danielbachhuber, My condolences, you're now the maintainer of a popular open source project" cite="https://web.archive.org/web/20220306014037/https://danielbachhuber.com/2016/06/26/my-condolences-youre-now-the-maintainer-of-a-popular-open-source-project/"}
In maintaining WP-CLI, I've discovered I need to make myself happy first, and set clear boundaries on my involvement. The best balance I've found is 2-5 hours per week, as a part of my normal work schedule. This keeps my involvement a passion, and from feeling too much like work. Because I prioritize the issues I'm working on, I can make regular progress on what I think is most important.
:::

### Communicate when you're away

Sometimes, it can be hard to take a break from open source work when it feels like everybody needs you. People may even try to make you feel guilty for stepping away.

Do your best to find support for your users and community while you're away from a project. If you can't find the support you need, take a break anyway. Be sure to communicate when you're not available, so people aren't confused by your lack of responsiveness.

Taking breaks applies to more than just vacations, too. If you don't want to do open source work on weekends, or during work hours, communicate those expectations to others, so they know not to bother you.

## Take care of yourself first!

Maintaining a popular project requires different skills than the earlier stages of growth, but it's no less rewarding. As a maintainer, you'll practice leadership and personal skills on a level that few people get to experience. While it's not always easy to manage, setting clear boundaries and only taking on what you're comfortable with will help you stay happy, refreshed, and productive.

## About this manual

Content based on [github.com/github/opensource.guide](https://github.com/github/opensource.guide) used under the [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) license.

The sources are two of GitHub's Open Source Guides, [Starting an Open Source Project](https://opensource.guide/starting-a-project/) and [Best Practices for Maintainers](https://opensource.guide/best-practices/), written by GitHub and the guides' contributors.

The license covers the text only. GitHub's trademarks, logos and branding are not covered by the CC BY 4.0 license.

### What was changed

- Combined the two guides into one manual, in their original order.
- Restructured the text into LibKa blocks: quotes, checklists, steps, callouts and a statement; long sections were split into shorter subsections with new headings.
- Removed all images, including avatars and screenshots of other projects; where an image carried information, it is described in the text.
- Made relative links absolute and gave some links more descriptive text.
