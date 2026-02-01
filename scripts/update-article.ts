import { prisma } from '../src/lib/prisma';
import { fetchFullText } from '../src/lib/fetchers/fulltext';
import { calculateReadingTime } from '../src/lib/utils/reading-time';

async function updateArticle() {
  const articleId = 'cml2yczud001p11slh1688dfb';

  // 获取当前文章
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });

  if (!article) {
    console.log('文章不存在');
    return;
  }

  console.log('=== 当前文章信息 ===');
  console.log('标题:', article.title);
  console.log('来源:', article.source.name);
  console.log('原文链接:', article.url);
  console.log('当前内容长度:', article.content?.length || 0, '字符');
  console.log('');

  // 抓取全文
  console.log('=== 抓取全文中... ===');
  const fullText = await fetchFullText(article.url);

  if (!fullText) {
    console.log('全文抓取失败');
    return;
  }

  console.log('全文长度:', fullText.content.length, '字符');
  const readingTime = calculateReadingTime(fullText.content);
  console.log('阅读时间:', readingTime, '分钟');
  console.log('');

  // 更新数据库
  console.log('=== 更新数据库 ===');
  await prisma.article.update({
    where: { id: articleId },
    data: {
      content: fullText.content,
      readingTime: readingTime,
      summaryStatus: 'pending'
    }
  });

  console.log('✅ 更新成功！');
  console.log('');
  console.log('=== 更新后的内容预览 ===');
  console.log(fullText.content.substring(0, 1000) + '...');
}

updateArticle().then(() => prisma.$disconnect());
